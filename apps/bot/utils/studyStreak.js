/**
 * Shared "user studied today" bookkeeping for solo, voice and team sessions:
 * streak continuation/protection and retention tracking.
 */

const { db, updateUser, recordStreakBreak } = require('./database');
const { getStreakProgress } = require('./streakPolicy');
const { Pets } = require('./constants');
const { consumeProStreakShield } = require('./premiumManager');

const MS_PER_DAY = 86400000;

function toEpochDay(dateOnly) {
    return dateOnly ? Math.floor(new Date(`${dateOnly}T00:00:00Z`).getTime() / MS_PER_DAY) : null;
}

/**
 * Update streak for a completed study session. When the user skipped days,
 * protection is tried in order: downtime grace, streak_shield item, Loyal Dog,
 * Pro streak shield. Returns { streak, protectedBy } where protectedBy is
 * null or one of 'item_shield' | 'loyal_dog' | 'pro_shield'.
 */
function applyStudyStreak(userId, user, activePet) {
    const today = new Date().toISOString().slice(0, 10);
    const todayDay = Math.floor(Date.now() / MS_PER_DAY);
    const lastDay = toEpochDay(user.last_study_date);
    let streak = user.streak || 0;
    let protectedBy = null;

    if (lastDay === todayDay) return { streak, protectedBy };

    if (lastDay === todayDay - 1) {
        streak += 1;
    } else if (getStreakProgress(user).action === 'downtime_grace') {
        streak = getStreakProgress(user).streak;
    } else {
        const shield = db.prepare(`
            SELECT * FROM inventory
            WHERE user_id = ? AND item_key = 'streak_shield' AND quantity > 0
        `).get(userId);
        const petInfo = activePet ? Pets[activePet.pet_key] : null;
        const lastGuardDay = toEpochDay(user.last_loyal_dog_date);
        const dogAvailable = petInfo?.special === 'streak_guard'
            && (lastGuardDay === null || todayDay - lastGuardDay >= 7);

        if (lastDay !== null && shield) {
            if (shield.quantity <= 1) {
                db.prepare('DELETE FROM inventory WHERE id = ?').run(shield.id);
            } else {
                db.prepare('UPDATE inventory SET quantity = quantity - 1 WHERE id = ?').run(shield.id);
            }
            streak += 1;
            protectedBy = 'item_shield';
        } else if (lastDay !== null && dogAvailable) {
            streak += 1;
            updateUser(userId, { last_loyal_dog_date: today });
            protectedBy = 'loyal_dog';
        } else if (lastDay !== null && streak > 0 && consumeProStreakShield(userId)) {
            streak += 1;
            protectedBy = 'pro_shield';
        } else {
            const gapDays = lastDay === null ? null : todayDay - lastDay;
            recordStreakBreak(userId, user.streak, gapDays);
            streak = 1;
        }
    }

    updateUser(userId, { streak, last_study_date: today });
    return { streak, protectedBy };
}

/**
 * Record that the user completed a session (drives daily-habit DMs,
 * re-activation campaigns and day-1/7/30 retention stats).
 */
function recordSessionActivity(userId) {
    try {
        db.prepare(`
            UPDATE users
            SET last_session_at = datetime('now'),
                session_count = COALESCE(session_count, 0) + 1,
                day1_retained = CASE WHEN julianday('now') - julianday(created_at) >= 1 THEN 1 ELSE day1_retained END,
                day7_retained = CASE WHEN julianday('now') - julianday(created_at) >= 7 THEN 1 ELSE day7_retained END,
                day30_retained = CASE WHEN julianday('now') - julianday(created_at) >= 30 THEN 1 ELSE day30_retained END
            WHERE discord_id = ?
        `).run(userId);
    } catch (err) {
        console.error('[STREAK] Retention tracking error:', err.message);
    }
}

module.exports = { applyStudyStreak, recordSessionActivity };
