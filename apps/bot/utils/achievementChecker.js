/**
 * Achievement checker — evaluates and unlocks achievements.
 * Called after study completion, team completion, and garden harvest.
 */

const { db, getOrCreateUser, unlockTitle } = require('./database');
const { Achievements } = require('./constants');

/**
 * Check if a user has a specific achievement.
 */
function hasAchievement(userId, achievementKey) {
    return !!db.prepare('SELECT 1 FROM user_achievements WHERE user_id = ? AND achievement_key = ?').get(userId, achievementKey);
}

/**
 * Unlock an achievement for a user. Returns the achievement if newly unlocked, null if already had.
 */
function unlockAchievement(userId, achievementKey) {
    if (hasAchievement(userId, achievementKey)) return null;

    const achievement = Achievements[achievementKey];
    if (!achievement) return null;

    try {
        db.prepare('INSERT INTO user_achievements (user_id, achievement_key) VALUES (?, ?)').run(userId, achievementKey);
        unlockTitle(userId, achievementKey);
        console.log(`[ACH] 🏆 ${userId} unlocked: ${achievement.name}`);
        return achievement;
    } catch (e) {
        return null; // Unique constraint
    }
}

/**
 * Get all unlocked achievements for a user.
 */
function getUserAchievements(userId) {
    return db.prepare('SELECT * FROM user_achievements WHERE user_id = ? ORDER BY unlocked_at').all(userId);
}

/**
 * Check all achievements after a study session completes.
 * Returns array of newly unlocked achievements.
 */
function checkStudyAchievements(userId, sessionDuration, sessionStartHour) {
    const unlocked = [];

    // ⏰ Time — Early Bird (before 6 AM)
    if (sessionStartHour < 6) {
        const a = unlockAchievement(userId, 'early_bird');
        if (a) unlocked.push(a);
    }

    // ⏰ Time — Night Owl (after midnight, 0-1 AM)
    if (sessionStartHour >= 0 && sessionStartHour < 1) {
        const a = unlockAchievement(userId, 'night_owl');
        if (a) unlocked.push(a);
    }

    // ⏰ Time — Marathon Runner (full 100-min session)
    if (sessionDuration >= 100) {
        const a = unlockAchievement(userId, 'marathon_runner');
        if (a) unlocked.push(a);
    }

    const user = getOrCreateUser(userId);

    // 🔥 Consistency
    if (user.streak >= 7) {
        const a = unlockAchievement(userId, 'dedicated');
        if (a) unlocked.push(a);
    }
    if (user.streak >= 30) {
        const a = unlockAchievement(userId, 'committed');
        if (a) unlocked.push(a);
    }
    if (user.streak >= 100) {
        const a = unlockAchievement(userId, 'unstoppable');
        if (a) unlocked.push(a);
    }

    // 📊 Volume (in hours)
    const totalHours = user.total_focus_minutes / 60;
    if (totalHours >= 10) {
        const a = unlockAchievement(userId, 'beginner');
        if (a) unlocked.push(a);
    }
    if (totalHours >= 100) {
        const a = unlockAchievement(userId, 'intermediate');
        if (a) unlocked.push(a);
    }
    if (totalHours >= 500) {
        const a = unlockAchievement(userId, 'expert');
        if (a) unlocked.push(a);
    }
    if (totalHours >= 1000) {
        const a = unlockAchievement(userId, 'master');
        if (a) unlocked.push(a);
    }

    return unlocked;
}

/**
 * Check team-related achievements.
 */
function checkTeamAchievements(userId) {
    const unlocked = [];

    // 👥 Team Player — joined 10 team sessions
    const joined = db.prepare('SELECT COUNT(*) as count FROM team_members WHERE user_id = ?').get(userId);
    if (joined && joined.count >= 10) {
        const a = unlockAchievement(userId, 'team_player');
        if (a) unlocked.push(a);
    }

    // 👥 Leader — hosted 50 team sessions
    const hosted = db.prepare("SELECT COUNT(*) as count FROM team_sessions WHERE host_id = ? AND status = 'completed'").get(userId);
    if (hosted && hosted.count >= 50) {
        const a = unlockAchievement(userId, 'leader');
        if (a) unlocked.push(a);
    }

    return unlocked;
}

/**
 * Check garden-related achievements.
 */
function checkGardenAchievements(userId) {
    const unlocked = [];

    const harvested = db.prepare('SELECT COUNT(*) as count FROM harvested_items WHERE user_id = ?').get(userId);

    // 🌱 Green Thumb — first harvest
    if (harvested && harvested.count >= 1) {
        const a = unlockAchievement(userId, 'green_thumb');
        if (a) unlocked.push(a);
    }

    // 🌻 Gardener — 50 harvests
    if (harvested && harvested.count >= 50) {
        const a = unlockAchievement(userId, 'gardener');
        if (a) unlocked.push(a);
    }

    // 🏡 Master Gardener — 100 harvests
    if (harvested && harvested.count >= 100) {
        const a = unlockAchievement(userId, 'master_gardener');
        if (a) unlocked.push(a);
    }

    return unlocked;
}

module.exports = {
    hasAchievement,
    unlockAchievement,
    getUserAchievements,
    checkStudyAchievements,
    checkTeamAchievements,
    checkGardenAchievements,
};
