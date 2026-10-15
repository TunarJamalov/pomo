/**
 * Pomo Plus / Pomo Pro subscriptions through Epoint.
 *
 * First payment: the website creates an `epoint_orders` row and sends the buyer
 * to Epoint ("register card and pay"). Epoint calls the website back; the website
 * checks the signature and queues the result in `billing_events`. This job works
 * through that queue, so payments made while the bot restarts are never lost.
 * A successful first payment opens an `epoint_subscriptions` row with the saved card.
 *
 * Renewals: when a period ends, this job charges the saved card (execute-pay).
 *   success           → next period, plan extended (until period end + grace)
 *   failed            → past_due, retried every 24h; after 3 failures the plan ends
 *   no answer         → wait for Epoint's callback before trying again, so a card is never charged twice
 *   cancelled by user → no charge; the plan ends when the paid period does
 *
 * Every order is applied at most once (epoint_orders.status), whichever of the
 * callback and the direct reply arrives first.
 */
const { db, getPremiumEntitlement, extendPremiumUntil } = require('../utils/database');
const { revokeProAccess, isFullPro } = require('../utils/premiumManager');
const { t, getUserLanguage } = require('../utils/i18n');
const { PRO_STREAK_SHIELDS } = require('../utils/constants');
const epoint = require('../utils/epoint');

const PROVIDER = 'epoint';
const SOURCE = 'epoint';
const GRANTED_BY = 'EPOINT';
const GRACE_DAYS = 3;
const MAX_ATTEMPTS = 3;
const HOUR_MS = 3600000;
const QUEUE_POLL_MS = 15 * 1000;
const RENEW_POLL_MS = 10 * 60 * 1000;

const toSql = date => date.toISOString().slice(0, 19).replace('T', ' ');
const fromSql = value => new Date(`${String(value).replace(' ', 'T')}Z`);

/** One month or one year later, keeping the day of month where it exists (31 Jan → 28/29 Feb). */
function addPeriod(date, cycle) {
    const d = new Date(date);
    const months = cycle === 'yearly' ? 12 : 1;
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
    return d;
}

function revokeIfOurs(userId, note) {
    const ent = getPremiumEntitlement(userId);
    if (ent?.status === 'active' && ent.source === SOURCE) {
        revokeProAccess(userId, GRANTED_BY, note);
        return true;
    }
    return false;
}

function grantPlan(userId, plan, periodEnd, subId) {
    const wasFullPro = isFullPro(userId);
    extendPremiumUntil({
        userId,
        until: new Date(periodEnd.getTime() + GRACE_DAYS * 86400000),
        grantedBy: GRANTED_BY,
        source: SOURCE,
        providerRef: `epoint:${subId}`,
        note: `Epoint subscription #${subId}`,
        planKey: plan,
    });
    // Streak shields come with Pro only
    if (plan === 'pro' && !wasFullPro) {
        db.prepare('UPDATE users SET streak_shields_remaining = ?, pro_shields_month = ? WHERE discord_id = ?')
            .run(PRO_STREAK_SHIELDS, new Date().toISOString().slice(0, 7), userId);
    }
}

/**
 * Applies a payment result (from a callback or a direct execute-pay reply) to its order.
 * Returns { result, userId?, change?, plan? }; change drives DMs and logs in notify().
 */
function applyPaymentResult(result, now = new Date()) {
    const orderId = String(result?.order_id || '');
    const order = db.prepare('SELECT * FROM epoint_orders WHERE order_id = ?').get(orderId);
    if (!order) return { result: `unknown order ${orderId || '-'}` };
    const userId = order.discord_id;
    if (order.status === 'success') return { result: `order ${orderId} already applied`, userId };

    if (result.status !== 'success') {
        db.prepare(`
            UPDATE epoint_orders SET status = 'failed', transaction_id = COALESCE(?, transaction_id), result = ?, updated_at = datetime('now')
            WHERE order_id = ? AND status != 'success'
        `).run(result.transaction || null, String(result.message || result.code || result.status || 'failed').slice(0, 200), orderId);
        return { result: `order ${orderId} ${result.status || 'failed'}`, userId };
    }

    // Never trust a payment for a different amount than we asked for
    if (result.amount != null && Math.abs(Number(result.amount) - Number(order.amount)) > 0.001) {
        db.prepare("UPDATE epoint_orders SET status = 'review', result = ?, updated_at = datetime('now') WHERE order_id = ?")
            .run(`amount ${result.amount} != ${order.amount}`, orderId);
        return { result: `order ${orderId} paid ${result.amount}, expected ${order.amount}: not applied`, userId, change: 'mismatch' };
    }

    return db.transaction(() => {
        let subId = order.subscription_id;
        let periodEnd;
        if (order.kind === 'renewal') {
            const sub = db.prepare('SELECT * FROM epoint_subscriptions WHERE id = ?').get(subId);
            if (!sub) return { result: `renewal ${orderId} for missing subscription ${subId}`, userId };
            periodEnd = addPeriod(fromSql(sub.current_period_end), sub.cycle);
            db.prepare(`
                UPDATE epoint_subscriptions SET status = 'active', current_period_end = ?, failed_attempts = 0,
                    next_attempt_at = NULL, card_mask = COALESCE(?, card_mask), updated_at = datetime('now')
                WHERE id = ?
            `).run(toSql(periodEnd), result.card_mask || null, subId);
        } else {
            // A new subscription replaces any other the user still has (e.g. moving from Plus to Pro)
            db.prepare(`
                UPDATE epoint_subscriptions SET status = 'replaced', updated_at = datetime('now')
                WHERE discord_id = ? AND status IN ('active', 'past_due')
            `).run(userId);
            periodEnd = addPeriod(now, order.cycle);
            subId = db.prepare(`
                INSERT INTO epoint_subscriptions (discord_id, plan, cycle, amount, card_id, card_mask, status, current_period_end)
                VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
            `).run(userId, order.plan, order.cycle, order.amount, result.card_id || null, result.card_mask || null, toSql(periodEnd)).lastInsertRowid;
        }

        db.prepare(`
            UPDATE epoint_orders SET status = 'success', transaction_id = ?, subscription_id = ?, result = 'paid', updated_at = datetime('now')
            WHERE order_id = ?
        `).run(result.transaction || null, subId, orderId);

        grantPlan(userId, order.plan, periodEnd, subId);
        const change = order.kind === 'renewal' ? 'renewed' : 'activated';
        return { result: `${order.plan} until ${periodEnd.toISOString()} (order ${orderId})`, userId, change, plan: order.plan };
    })();
}

function endSubscription(sub, status, note) {
    db.prepare("UPDATE epoint_subscriptions SET status = ?, next_attempt_at = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(status, sub.id);
    const revoked = revokeIfOurs(sub.discord_id, note);
    return { result: `subscription #${sub.id} ${status}${revoked ? ', plan removed' : ''}`, userId: sub.discord_id, change: revoked ? 'ended' : undefined };
}

async function renewOne(sub, now, charge) {
    if (sub.cancel_at_period_end) return endSubscription(sub, 'canceled', 'cancelled by the user');
    if (!sub.card_id) return endSubscription(sub, 'ended', 'no saved card to renew with');

    // A renewal that got no answer may still go through; give its callback a day before trying again
    const pending = db.prepare(`
        SELECT order_id, created_at FROM epoint_orders
        WHERE subscription_id = ? AND kind = 'renewal' AND status = 'new'
        ORDER BY created_at DESC LIMIT 1
    `).get(sub.id);
    if (pending) {
        if (now - fromSql(pending.created_at) < 24 * HOUR_MS) {
            db.prepare('UPDATE epoint_subscriptions SET next_attempt_at = ? WHERE id = ?').run(toSql(new Date(now.getTime() + HOUR_MS)), sub.id);
            return { result: `subscription #${sub.id} waiting for order ${pending.order_id}` };
        }
        db.prepare("UPDATE epoint_orders SET status = 'failed', result = 'no answer', updated_at = datetime('now') WHERE order_id = ?").run(pending.order_id);
    }

    const orderId = `pomo-r${sub.id}-${now.getTime()}`;
    db.prepare(`
        INSERT INTO epoint_orders (order_id, discord_id, plan, cycle, amount, kind, subscription_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'renewal', ?, ?, ?)
    `).run(orderId, sub.discord_id, sub.plan, sub.cycle, sub.amount, sub.id, toSql(now), toSql(now));

    let reply;
    try {
        reply = await charge({
            cardId: sub.card_id,
            orderId,
            amount: sub.amount,
            description: `Pomo ${sub.plan === 'pro' ? 'Pro' : 'Plus'} (${sub.cycle}) renewal`,
        });
    } catch (err) {
        db.prepare('UPDATE epoint_subscriptions SET next_attempt_at = ? WHERE id = ?').run(toSql(new Date(now.getTime() + HOUR_MS)), sub.id);
        return { result: `renewal ${orderId} got no answer: ${err.message}` };
    }

    const outcome = applyPaymentResult({ ...reply, order_id: orderId }, now);
    if (reply?.status === 'success') return outcome;

    const attempts = sub.failed_attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
        const ended = endSubscription(sub, 'ended', `renewal failed ${attempts} times`);
        return { ...ended, result: `${ended.result} after ${attempts} failed payments` };
    }
    db.prepare(`
        UPDATE epoint_subscriptions SET status = 'past_due', failed_attempts = ?, next_attempt_at = ?, updated_at = datetime('now')
        WHERE id = ?
    `).run(attempts, toSql(new Date(now.getTime() + 24 * HOUR_MS)), sub.id);
    return {
        result: `renewal ${orderId} failed (${attempts}/${MAX_ATTEMPTS}): ${reply?.message || reply?.status || 'unknown'}`,
        userId: sub.discord_id,
        change: attempts === 1 ? 'payment_failed' : undefined,
    };
}

/** Charges every subscription whose period is over. Returns the outcomes. */
async function renewDue(now = new Date(), charge = epoint.chargeSavedCard) {
    const due = db.prepare(`
        SELECT * FROM epoint_subscriptions
        WHERE status IN ('active', 'past_due') AND current_period_end <= ?
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY current_period_end
    `).all(toSql(now), toSql(now));
    const outcomes = [];
    for (const sub of due) {
        let outcome;
        try {
            outcome = await renewOne(sub, now, charge);
        } catch (err) {
            outcome = { result: `renewal of #${sub.id} errored: ${err.message}` };
            console.error('[Billing] Renewal failed:', sub.id, err);
        }
        console.log(`[Billing] ${outcome.result}`);
        outcomes.push(outcome);
    }
    return outcomes;
}

async function notify(client, outcome) {
    const { userId, change } = outcome;
    if (!client || !change) return;
    const logChannelId = process.env.OWNER_LOG_CHANNEL_ID;
    const log = async text => {
        if (!logChannelId) return;
        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        await channel?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
    };
    const dm = (key, vars) => client.users.fetch(userId).then(u => u.send(t(getUserLanguage(userId), key, vars))).catch(() => {});
    const planName = plan => t(getUserLanguage(userId), plan === 'pro' ? 'planNamePro' : 'planNamePlus');

    if (change === 'activated') {
        require('../utils/premiumCheck').syncPremiumRole(client, userId, true).catch(() => {});
        await dm('epointActivatedDm', { plan: planName(outcome.plan) });
        await log(`💰 New ${outcome.plan === 'pro' ? 'Pomo Pro' : 'Pomo Plus'}: <@${userId}>`);
    } else if (change === 'renewed') {
        await log(`🔁 Renewed ${outcome.plan === 'pro' ? 'Pomo Pro' : 'Pomo Plus'}: <@${userId}>`);
    } else if (change === 'payment_failed') {
        await dm('epointPaymentFailedDm');
        await log(`⚠️ Renewal payment failed: <@${userId}>`);
    } else if (change === 'ended') {
        require('../utils/premiumCheck').syncPremiumRole(client, userId, false).catch(() => {});
        await dm('premiumExpiryDm');
        await log(`📉 Plan ended: <@${userId}> (${outcome.result})`);
    } else if (change === 'mismatch') {
        await log(`🚨 Epoint payment with an unexpected amount for <@${userId}>: ${outcome.result}`);
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
            outcome = applyPaymentResult(JSON.parse(row.payload));
        } catch (err) {
            outcome = { result: `error: ${err.message}` };
            console.error('[Billing] Event failed:', row.id, err);
        }
        db.prepare("UPDATE billing_events SET processed_at = datetime('now'), result = ? WHERE id = ?").run(outcome.result.slice(0, 500), row.id);
        console.log(`[Billing] #${row.id}: ${outcome.result}`);
        await notify(client, outcome).catch(() => {});
    }
    return rows.length;
}

function startBillingProcessor(client) {
    let queueRunning = false;
    let renewRunning = false;
    const queueTick = async () => {
        if (queueRunning) return;
        queueRunning = true;
        try { await processQueue(client); } catch (err) { console.error('[Billing] Queue error:', err.message); }
        queueRunning = false;
    };
    const renewTick = async () => {
        if (renewRunning || !epoint.configured()) return;
        renewRunning = true;
        try {
            for (const outcome of await renewDue()) await notify(client, outcome).catch(() => {});
        } catch (err) {
            console.error('[Billing] Renewal job error:', err.message);
        }
        renewRunning = false;
    };
    queueTick();
    setInterval(queueTick, QUEUE_POLL_MS);
    setInterval(renewTick, RENEW_POLL_MS);
    console.log(`[Billing] Epoint processor started (renewals ${epoint.configured() ? 'on' : 'off: EPOINT keys missing'}).`);
}

module.exports = { addPeriod, applyPaymentResult, renewDue, processQueue, startBillingProcessor };
