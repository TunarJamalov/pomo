/**
 * Turns verified Lemon Squeezy webhooks into Pomo Pro.
 *
 * The website receives the webhook, checks its signature and stores it in
 * `billing_events`; this job works through that queue. Because the queue lives
 * in the database, payments made while the bot is offline are applied as soon
 * as it comes back.
 *
 * Rules:
 *   active / on_trial / past_due  → Pro until renews_at (+ grace)
 *   cancelled                     → Pro until ends_at (+ grace), then it lapses on its own
 *   expired / unpaid / refunded   → Pro revoked, but only if it came from Lemon Squeezy
 */
const { db, getPremiumEntitlement, extendPremiumUntil } = require('../utils/database');
const { revokeProAccess, isProActive } = require('../utils/premiumManager');
const { t, getUserLanguage } = require('../utils/i18n');
const { PRO_STREAK_SHIELDS } = require('../utils/constants');

const PROVIDER = 'lemonsqueezy';
const SOURCE = 'lemonsqueezy';
const GRACE_DAYS = 2;
const POLL_MS = 15 * 1000;
const SNOWFLAKE = /^\d{17,20}$/;

function parseDate(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
}

function revokeIfOurs(userId, note) {
    const ent = getPremiumEntitlement(userId);
    if (ent?.status === 'active' && ent.source === SOURCE) {
        revokeProAccess(userId, 'LEMONSQUEEZY', note);
        return true;
    }
    return false;
}

function saveSubscription(subscriptionId, discordId, attrs, testMode) {
    db.prepare(`
        INSERT INTO billing_subscriptions (provider, subscription_id, discord_id, status, variant_name, renews_at, ends_at, customer_portal_url, test_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(provider, subscription_id) DO UPDATE SET
            discord_id = COALESCE(excluded.discord_id, billing_subscriptions.discord_id),
            status = excluded.status,
            variant_name = COALESCE(excluded.variant_name, billing_subscriptions.variant_name),
            renews_at = excluded.renews_at,
            ends_at = excluded.ends_at,
            customer_portal_url = COALESCE(excluded.customer_portal_url, billing_subscriptions.customer_portal_url),
            test_mode = excluded.test_mode,
            updated_at = datetime('now')
    `).run(PROVIDER, subscriptionId, discordId, attrs.status || null, attrs.variant_name || null,
        attrs.renews_at || null, attrs.ends_at || null, attrs.urls?.customer_portal || null, testMode ? 1 : 0);
}

function findSubscriptionOwner(subscriptionId) {
    return db.prepare('SELECT discord_id FROM billing_subscriptions WHERE provider = ? AND subscription_id = ?')
        .get(PROVIDER, String(subscriptionId))?.discord_id || null;
}

/**
 * Applies one webhook payload. Returns { result, userId?, change? } where change is
 * 'activated' | 'renewed' | 'ended' | 'unlinked' for side effects (DMs, logs).
 */
function applyLemonSqueezyEvent(payload, { allowTest = process.env.LEMONSQUEEZY_ALLOW_TEST === 'true' } = {}) {
    const meta = payload?.meta || {};
    const data = payload?.data || {};
    const attrs = data.attributes || {};
    const eventName = meta.event_name || 'unknown';
    const testMode = Boolean(meta.test_mode ?? attrs.test_mode);
    if (testMode && !allowTest) return { result: `ignored test-mode ${eventName}` };

    const custom = meta.custom_data || {};
    const claimed = SNOWFLAKE.test(String(custom.discord_id || '')) ? String(custom.discord_id) : null;

    if (data.type === 'subscriptions') {
        const subscriptionId = String(data.id);
        const userId = claimed || findSubscriptionOwner(subscriptionId);
        saveSubscription(subscriptionId, userId, attrs, testMode);
        if (!userId) return { result: `no discord id for subscription ${subscriptionId}`, change: 'unlinked', email: attrs.user_email };

        const status = attrs.status;
        if (['active', 'on_trial', 'past_due', 'cancelled'].includes(status)) {
            const end = parseDate(status === 'cancelled' ? attrs.ends_at : attrs.renews_at);
            if (!end || end <= new Date()) return { result: `subscription ${subscriptionId} ${status} without a future date`, userId };
            const wasActive = isProActive(userId);
            const until = new Date(end.getTime() + GRACE_DAYS * 86400000);
            extendPremiumUntil({
                userId, until, grantedBy: 'LEMONSQUEEZY', source: SOURCE,
                providerRef: subscriptionId, note: `${attrs.variant_name || 'Pro'} (${status})${testMode ? ' TEST' : ''}`,
            });
            if (!wasActive) {
                db.prepare('UPDATE users SET streak_shields_remaining = ?, pro_shields_month = ? WHERE discord_id = ?')
                    .run(PRO_STREAK_SHIELDS, new Date().toISOString().slice(0, 7), userId);
            }
            return { result: `pro until ${until.toISOString()} (${status})`, userId, change: wasActive ? 'renewed' : 'activated', plan: attrs.variant_name };
        }
        if (['expired', 'unpaid', 'paused'].includes(status)) {
            const revoked = revokeIfOurs(userId, `subscription ${status}`);
            return { result: revoked ? `revoked (${status})` : `nothing to revoke (${status})`, userId, change: revoked ? 'ended' : undefined };
        }
        return { result: `ignored subscription status ${status}`, userId };
    }

    if (data.type === 'subscription-invoices' && eventName === 'subscription_payment_refunded') {
        const userId = claimed || findSubscriptionOwner(attrs.subscription_id);
        if (!userId) return { result: 'refund for unknown subscription' };
        const revoked = revokeIfOurs(userId, 'payment refunded');
        return { result: revoked ? 'revoked (refund)' : 'refund, nothing to revoke', userId, change: revoked ? 'ended' : undefined };
    }

    if (data.type === 'orders' && eventName === 'order_refunded' && claimed) {
        const revoked = revokeIfOurs(claimed, 'order refunded');
        return { result: revoked ? 'revoked (order refund)' : 'order refund, nothing to revoke', userId: claimed, change: revoked ? 'ended' : undefined };
    }

    return { result: `ignored ${eventName}` };
}

async function notify(client, outcome) {
    const { userId, change } = outcome;
    const logChannelId = process.env.OWNER_LOG_CHANNEL_ID;
    const log = async text => {
        if (!logChannelId) return;
        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        await channel?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    };
    if (change === 'unlinked') {
        await log(`⚠️ Lemon Squeezy payment without a Discord id (${outcome.email || 'no email'}). Grant it with \`/premiumadmin\`.`);
        return;
    }
    if (!userId || !change || change === 'renewed') return;
    if (change === 'activated') {
        require('../utils/premiumCheck').syncPremiumRole(client, userId, true).catch(() => {});
        await client.users.fetch(userId).then(u => u.send(t(getUserLanguage(userId), 'proActivatedDm'))).catch(() => {});
        await log(`💰 New Pomo Pro: <@${userId}> (${outcome.plan || 'Pro'})`);
    } else if (change === 'ended') {
        require('../utils/premiumCheck').syncPremiumRole(client, userId, false).catch(() => {});
        await client.users.fetch(userId).then(u => u.send(t(getUserLanguage(userId), 'premiumExpiryDm'))).catch(() => {});
        await log(`📉 Pomo Pro ended: <@${userId}>`);
    }
}

async function processQueue(client) {
    const rows = db.prepare(`
        SELECT id, payload FROM billing_events
        WHERE provider = ? AND processed_at IS NULL ORDER BY id LIMIT 25
    `).all(PROVIDER);
    for (const row of rows) {
        let outcome;
        try {
            outcome = applyLemonSqueezyEvent(JSON.parse(row.payload));
        } catch (err) {
            outcome = { result: `error: ${err.message}` };
            console.error('[Billing] Event failed:', row.id, err);
        }
        db.prepare("UPDATE billing_events SET processed_at = datetime('now'), result = ? WHERE id = ?").run(outcome.result.slice(0, 500), row.id);
        console.log(`[Billing] #${row.id}: ${outcome.result}`);
        if (client) await notify(client, outcome).catch(() => {});
    }
    return rows.length;
}

function startBillingProcessor(client) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try { await processQueue(client); } catch (err) { console.error('[Billing] Queue error:', err.message); }
        running = false;
    };
    tick();
    setInterval(tick, POLL_MS);
    console.log('[Billing] Lemon Squeezy queue processor started.');
}

module.exports = { applyLemonSqueezyEvent, processQueue, startBillingProcessor };
