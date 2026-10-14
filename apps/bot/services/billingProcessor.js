/**
 * Turns verified Paddle webhooks into Pomo Pro.
 *
 * The website receives the webhook, checks its signature and stores it in
 * `billing_events`; this job works through that queue. Because the queue lives
 * in the database, payments made while the bot is offline are applied as soon
 * as it comes back.
 *
 * Rules:
 *   active / trialing / past_due  → Pro until the end of the current billing period (+ grace)
 *   canceled / paused             → Pro revoked, but only if it came from Paddle
 *   refund or chargeback approved → Pro revoked, but only if it came from Paddle
 *
 * A cancellation is scheduled for the end of the paid period, so Paddle sends
 * `canceled` only once that period is over.
 */
const { db, getPremiumEntitlement, extendPremiumUntil } = require('../utils/database');
const { revokeProAccess, isProActive } = require('../utils/premiumManager');
const { t, getUserLanguage } = require('../utils/i18n');
const { PRO_STREAK_SHIELDS } = require('../utils/constants');

const PROVIDER = 'paddle';
const SOURCE = 'paddle';
const GRANTED_BY = 'PADDLE';
const GRACE_DAYS = 2;
const POLL_MS = 15 * 1000;
const SNOWFLAKE = /^\d{17,20}$/;

function parseDate(value) {
    const d = value ? new Date(value) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
}

function isSandbox() {
    return process.env.PADDLE_ENV !== 'production';
}

/** In sandbox only the listed Discord ids (the owner's test accounts) can get Pro from a payment. */
function sandboxAllows(userId) {
    const allowed = (process.env.PADDLE_TEST_DISCORD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    return allowed.includes(String(userId));
}

function revokeIfOurs(userId, note) {
    const ent = getPremiumEntitlement(userId);
    if (ent?.status === 'active' && ent.source === SOURCE) {
        revokeProAccess(userId, GRANTED_BY, note);
        return true;
    }
    return false;
}

function planName(sub) {
    const cycle = sub.items?.[0]?.price?.billing_cycle;
    if (cycle?.interval === 'year') return 'Yearly';
    if (cycle?.interval === 'month') return 'Monthly';
    return sub.items?.[0]?.price?.name || null;
}

function saveSubscription(sub, discordId) {
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
    `).run(PROVIDER, String(sub.id), discordId, sub.status || null, planName(sub),
        sub.next_billed_at || null, sub.current_billing_period?.ends_at || null,
        sub.management_urls?.cancel || null, isSandbox() ? 1 : 0);
}

function findSubscriptionOwner(subscriptionId) {
    if (!subscriptionId) return null;
    return db.prepare('SELECT discord_id FROM billing_subscriptions WHERE provider = ? AND subscription_id = ?')
        .get(PROVIDER, String(subscriptionId))?.discord_id || null;
}

function claimedDiscordId(data) {
    const id = String(data?.custom_data?.discord_id || '');
    return SNOWFLAKE.test(id) ? id : null;
}

/**
 * Applies one webhook payload. Returns { result, userId?, change? } where change is
 * 'activated' | 'renewed' | 'ended' | 'unlinked' for side effects (DMs, logs).
 */
function applyPaddleEvent(payload) {
    const eventType = payload?.event_type || 'unknown';
    const data = payload?.data || {};

    if (eventType.startsWith('subscription.')) {
        const userId = claimedDiscordId(data) || findSubscriptionOwner(data.id);
        if (userId && isSandbox() && !sandboxAllows(userId)) {
            return { result: `ignored sandbox ${eventType} for ${userId} (not a test account)` };
        }
        saveSubscription(data, userId);
        if (!userId) return { result: `no discord id for subscription ${data.id}`, change: 'unlinked', customer: data.customer_id };

        const status = data.status;
        if (['active', 'trialing', 'past_due'].includes(status)) {
            const end = parseDate(data.current_billing_period?.ends_at);
            if (!end || end <= new Date()) return { result: `subscription ${data.id} ${status} without a future period end`, userId };
            const wasActive = isProActive(userId);
            const until = new Date(end.getTime() + GRACE_DAYS * 86400000);
            const plan = planName(data) || 'Pro';
            extendPremiumUntil({
                userId, until, grantedBy: GRANTED_BY, source: SOURCE,
                providerRef: String(data.id), note: `${plan} (${status})${isSandbox() ? ' SANDBOX' : ''}`,
            });
            if (!wasActive) {
                db.prepare('UPDATE users SET streak_shields_remaining = ?, pro_shields_month = ? WHERE discord_id = ?')
                    .run(PRO_STREAK_SHIELDS, new Date().toISOString().slice(0, 7), userId);
            }
            return { result: `pro until ${until.toISOString()} (${status})`, userId, change: wasActive ? 'renewed' : 'activated', plan };
        }
        if (['canceled', 'paused'].includes(status)) {
            const revoked = revokeIfOurs(userId, `subscription ${status}`);
            return { result: revoked ? `revoked (${status})` : `nothing to revoke (${status})`, userId, change: revoked ? 'ended' : undefined };
        }
        return { result: `ignored subscription status ${status}`, userId };
    }

    if (eventType.startsWith('adjustment.')) {
        // Refunds and chargebacks; credits and pending requests change nothing
        const takesMoneyBack = ['refund', 'chargeback'].includes(data.action) && data.status === 'approved';
        if (!takesMoneyBack) return { result: `ignored ${data.action || 'adjustment'} (${data.status || 'unknown'})` };
        const userId = findSubscriptionOwner(data.subscription_id);
        if (!userId) return { result: `${data.action} for unknown subscription ${data.subscription_id || '-'}` };
        const revoked = revokeIfOurs(userId, `payment ${data.action}`);
        return { result: revoked ? `revoked (${data.action})` : `${data.action}, nothing to revoke`, userId, change: revoked ? 'ended' : undefined };
    }

    return { result: `ignored ${eventType}` };
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
        await log(`⚠️ Paddle subscription without a Discord id (customer ${outcome.customer || 'unknown'}). Grant it with \`/premiumadmin\`.`);
        return;
    }
    if (!userId || !change || change === 'renewed') return;
    if (change === 'activated') {
        require('../utils/premiumCheck').syncPremiumRole(client, userId, true).catch(() => {});
        await client.users.fetch(userId).then(u => u.send(t(getUserLanguage(userId), 'proActivatedDm'))).catch(() => {});
        await log(`💰 New Pomo Pro: <@${userId}> (${outcome.plan || 'Pro'})${isSandbox() ? ' [sandbox]' : ''}`);
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
            outcome = applyPaddleEvent(JSON.parse(row.payload));
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
    console.log(`[Billing] Paddle queue processor started (${isSandbox() ? 'sandbox' : 'production'}).`);
}

module.exports = { applyPaddleEvent, processQueue, startBillingProcessor };
