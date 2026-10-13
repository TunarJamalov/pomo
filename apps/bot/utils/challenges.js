/**
 * Progress for every /challenge type, in one place:
 *   time      focus minutes                 (stored, per member)
 *   sessions  completed sessions            (stored, per member)
 *   team      focus minutes, summed over all members against one target
 *   streak    best run of consecutive study days since joining (stored)
 *   goal      to-dos completed since joining, counted from the todos table so
 *             goals finished on the website count too
 * Completion is recorded once per member (or once per challenge for team) and
 * returned as short messages the caller can post.
 */
const { db, getActiveChallengesForUser } = require('./database');
const { resolveTimeZone, localDay, shiftDay } = require('./habits');

const UNIT = { time: 'min', team: 'min', streak: 'days', sessions: 'sessions', goal: 'goals' };

function targetLabel(type, value) {
    return `${value} ${UNIT[type] || ''}`.trim();
}

function addProgress(challengeId, userId, amount) {
    db.prepare('UPDATE challenge_members SET progress = progress + ? WHERE challenge_id = ? AND user_id = ?')
        .run(amount, challengeId, userId);
}

/** Extends the member's run of consecutive study days; progress keeps the best run. */
function recordStreakDay(challengeId, userId, day) {
    const member = db.prepare('SELECT progress, streak_last_day, streak_run FROM challenge_members WHERE challenge_id = ? AND user_id = ?')
        .get(challengeId, userId);
    if (!member || member.streak_last_day === day) return;
    const run = member.streak_last_day === shiftDay(day, -1) ? (member.streak_run || 0) + 1 : 1;
    db.prepare('UPDATE challenge_members SET streak_last_day = ?, streak_run = ?, progress = MAX(progress, ?) WHERE challenge_id = ? AND user_id = ?')
        .run(day, run, run, challengeId, userId);
}

/** Recounts goal challenges from completed to-dos (idempotent). */
function syncGoalProgress(userId) {
    const rows = db.prepare(`
        SELECT cm.challenge_id, cm.joined_at, c.end_date FROM challenge_members cm
        JOIN challenges c ON c.id = cm.challenge_id
        WHERE cm.user_id = ? AND c.challenge_type = 'goal' AND c.status = 'active'
    `).all(userId);
    for (const row of rows) {
        const { n } = db.prepare(`
            SELECT COUNT(*) AS n FROM todos
            WHERE user_id = ? AND completed = 1
              AND datetime(completed_at) >= datetime(?) AND datetime(completed_at) <= datetime(?)
        `).get(userId, row.joined_at, row.end_date);
        db.prepare('UPDATE challenge_members SET progress = ? WHERE challenge_id = ? AND user_id = ?').run(n, row.challenge_id, userId);
    }
    return rows.map(r => r.challenge_id);
}

/** Marks newly finished challenges and returns announcement lines. */
function collectCompletions(challengeIds, userId) {
    const news = [];
    for (const id of challengeIds) {
        const ch = db.prepare('SELECT * FROM challenges WHERE id = ?').get(id);
        if (!ch) continue;
        if (ch.challenge_type === 'team') {
            const { total } = db.prepare('SELECT COALESCE(SUM(progress), 0) AS total FROM challenge_members WHERE challenge_id = ?').get(id);
            if (total < ch.target_value) continue;
            const marked = db.prepare("UPDATE challenges SET completed_at = datetime('now') WHERE id = ? AND completed_at IS NULL").run(id);
            if (marked.changes) news.push(`🎉 Team challenge **${ch.title}** reached its goal of **${targetLabel('team', ch.target_value)}**! Great work, everyone.`);
            continue;
        }
        const member = db.prepare('SELECT progress FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(id, userId);
        if (!member || member.progress < ch.target_value) continue;
        const marked = db.prepare("UPDATE challenge_members SET completed_at = datetime('now') WHERE challenge_id = ? AND user_id = ? AND completed_at IS NULL")
            .run(id, userId);
        if (marked.changes) news.push(`🏆 <@${userId}> completed the challenge **${ch.title}** (${targetLabel(ch.challenge_type, ch.target_value)})!`);
    }
    return news;
}

/**
 * Call after any finished focus (solo, team or voice) in a server.
 * Returns announcement lines for challenges that were just completed.
 */
function recordChallengeFocus({ userId, guildId, minutes = 0, now = new Date() }) {
    if (!guildId) return [];
    const active = getActiveChallengesForUser(userId, guildId);
    if (!active.length) return [];
    const day = localDay(resolveTimeZone(userId, guildId), now);
    for (const ch of active) {
        if (ch.challenge_type === 'time' || ch.challenge_type === 'team') {
            if (minutes > 0) addProgress(ch.id, userId, minutes);
        } else if (ch.challenge_type === 'sessions') {
            addProgress(ch.id, userId, 1);
        } else if (ch.challenge_type === 'streak') {
            if (minutes > 0) recordStreakDay(ch.id, userId, day);
        }
    }
    return collectCompletions(active.map(ch => ch.id), userId);
}

/** Call after a to-do is completed. Returns announcement lines. */
function recordGoalCompleted(userId) {
    return collectCompletions(syncGoalProgress(userId), userId);
}

module.exports = { recordChallengeFocus, recordGoalCompleted, syncGoalProgress, targetLabel, UNIT };
