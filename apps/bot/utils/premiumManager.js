const {
    db,
    grantPremium,
    revokePremium,
    getPremiumEntitlement,
} = require('./database');
const { GardenPlotLimits, PRO_STREAK_SHIELDS } = require('./constants');
const { t, getUserLanguage } = require('./i18n');

/**
 * Pomo Pro is stored in premium_entitlements (the same table /premium status,
 * the 2x water perk and /premiumadmin read). These helpers are the only place
 * Pro-specific extras (streak shields, lapse state) are kept in sync with it.
 */

/**
 * Grant or extend Pro. Returns the updated entitlement row.
 * Called by: premiumadmin grant and the reactivation campaign. Paid Pro from
 * Lemon Squeezy uses extendPremiumUntil (services/billingProcessor.js).
 */
function grantProAccess(userId, days = 30, grantedBy = 'OWNER_MANUAL', { note = null, source = 'manual' } = {}) {
    const entitlement = grantPremium({
        userId,
        durationDays: days,
        grantedBy,
        note,
        planKey: 'pro_beta',
        source,
    });

    db.prepare(`
        UPDATE users SET
            streak_shields_remaining = ?,
            pro_shields_month        = ?,
            lapse_detected_at        = NULL,
            lapse_check_count        = 0
        WHERE discord_id = ?
    `).run(PRO_STREAK_SHIELDS, currentMonth(), userId);

    console.log(`[PremiumManager] Pro granted to ${userId} for ${days} days (by ${grantedBy})`);
    return entitlement;
}

/**
 * Revoke Pro. Never deletes garden or progress data; extra plots simply stop
 * accepting new seeds. Returns true if an active grant was revoked.
 */
function revokeProAccess(userId, revokedBy = 'SYSTEM', note = null) {
    const revoked = revokePremium(userId, revokedBy, note);

    db.prepare(`
        UPDATE users SET
            streak_shields_remaining = 0,
            lapse_detected_at        = NULL,
            lapse_check_count        = 0
        WHERE discord_id = ?
    `).run(userId);

    console.log(`[PremiumManager] Pro revoked for ${userId}`);
    return revoked;
}

/**
 * Synchronous Pro check from the database (managed entitlement or legacy flag).
 * Discord supporter roles are only checked by the async premiumCheck.isPremium.
 */
function isProActive(userId) {
    const entitlement = getPremiumEntitlement(userId);
    if (entitlement?.status === 'active') return true;
    const user = db.prepare('SELECT premium FROM users WHERE discord_id = ?').get(userId);
    return user?.premium === 1;
}

function getMaxGardenPlots(userId) {
    return isProActive(userId) ? GardenPlotLimits.PRO : GardenPlotLimits.FREE;
}

function currentMonth(date = new Date()) {
    return date.toISOString().slice(0, 7);
}

/**
 * Pro includes PRO_STREAK_SHIELDS shields per calendar month (UTC). The
 * refill happens lazily the first time shields are used or read in a month.
 */
function refillProStreakShields(userId) {
    if (!isProActive(userId)) return;
    db.prepare(`
        UPDATE users SET streak_shields_remaining = ?, pro_shields_month = ?
        WHERE discord_id = ? AND (pro_shields_month IS NULL OR pro_shields_month <> ?)
    `).run(PRO_STREAK_SHIELDS, currentMonth(), userId, currentMonth());
}

/**
 * Spend one Pro streak shield if the user has Pro and a shield left.
 * Returns true when the streak should be protected.
 */
function consumeProStreakShield(userId) {
    if (!isProActive(userId)) return false;
    refillProStreakShields(userId);
    const result = db.prepare(`
        UPDATE users SET streak_shields_remaining = streak_shields_remaining - 1
        WHERE discord_id = ? AND streak_shields_remaining > 0
    `).run(userId);
    return result.changes > 0;
}

/**
 * Hourly job: mark lapsed entitlements expired and tell the user once.
 */
function startPremiumExpiryJob(client) {
    const checkExpiry = async () => {
        try {
            const expired = db.prepare(`
                SELECT user_id FROM premium_entitlements
                WHERE status = 'active'
                  AND expires_at IS NOT NULL
                  AND expires_at <= datetime('now')
            `).all();

            for (const { user_id: userId } of expired) {
                // getPremiumEntitlement flips the row to 'expired' as a side effect
                getPremiumEntitlement(userId);
                db.prepare('UPDATE users SET streak_shields_remaining = 0 WHERE discord_id = ?').run(userId);
                console.log(`[PremiumManager] Pro expired for ${userId}`);

                // The grant added the supporter role; take it back so the role
                // never outlives the subscription
                if (client) {
                    require('./premiumCheck').syncPremiumRole(client, userId, false).catch(() => {});
                }

                if (client) {
                    // One DM at a time with a pause, so a batch of expiries can't burst
                    await client.users.fetch(userId)
                        .then(u => u.send(t(getUserLanguage(userId), 'premiumExpiryDm')))
                        .catch(() => {});
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        } catch (err) {
            console.error('[PremiumManager] Expiry job error:', err.message);
        }
    };

    checkExpiry();
    setInterval(checkExpiry, 60 * 60 * 1000);
    console.log('[PremiumManager] Pro expiry job started.');
}

module.exports = {
    grantProAccess,
    revokeProAccess,
    isProActive,
    getMaxGardenPlots,
    consumeProStreakShield,
    refillProStreakShields,
    startPremiumExpiryJob,
};
