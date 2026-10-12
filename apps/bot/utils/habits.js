/**
 * Habit tracker (/habit), in the spirit of HabitKit: one square per day,
 * yes/no or count habits, daily or N-days-a-week schedules, streaks.
 *
 * Days are local dates (YYYY-MM-DD) in the user's habit time zone, falling
 * back to the server's time zone and then UTC. Habits are archived, never
 * deleted, so history is kept.
 */
const { db, getOrCreateUser, incrementUser } = require('./database');
const { getTimeZoneParts, formatLocalDate, addLocalDays, normalizeTimeZone } = require('./timezone');

const FREE_HABITS = 5;
const PRO_HABITS = 15;
const REWARD_WATER = 1;
const DAILY_REWARD_CAP = 3;
const HISTORY_DAYS = 26 * 7;
const COLORS = ['#f0533f', '#4fb35f', '#4fb3d9', '#e8a53a', '#a78bfa', '#f472b6'];

// ── Days ──────────────────────────────────────────────────────

function resolveTimeZone(userId, guildId = null) {
    const own = db.prepare('SELECT timezone FROM habit_settings WHERE user_id = ?').get(userId)?.timezone;
    if (own) return own;
    if (guildId) {
        const guildTz = db.prepare('SELECT timezone FROM guild_settings WHERE guild_id = ?').get(guildId)?.timezone;
        if (guildTz) return guildTz;
    }
    return 'UTC';
}

function setTimeZone(userId, timeZone) {
    const normalized = normalizeTimeZone(timeZone);
    if (!normalized) return null;
    getOrCreateUser(userId);
    db.prepare(`
        INSERT INTO habit_settings (user_id, timezone) VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone
    `).run(userId, normalized);
    return normalized;
}

function localDay(timeZone, date = new Date()) {
    return formatLocalDate(getTimeZoneParts(date, timeZone));
}

function shiftDay(day, days) {
    const [year, month, d] = day.split('-').map(Number);
    return formatLocalDate(addLocalDays({ year, month, day: d }, days));
}

/** Monday of the week containing `day` (both YYYY-MM-DD). */
function weekStart(day) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
    return shiftDay(day, -((weekday + 6) % 7));
}

// ── Habits ────────────────────────────────────────────────────

function listHabits(userId) {
    return db.prepare(`
        SELECT * FROM habits WHERE user_id = ? AND archived_at IS NULL ORDER BY id
    `).all(userId);
}

function getHabit(userId, habitId) {
    return db.prepare('SELECT * FROM habits WHERE id = ? AND user_id = ? AND archived_at IS NULL').get(habitId, userId) || null;
}

function getHabitLimit(userId) {
    const { isProActive } = require('./premiumManager');
    return isProActive(userId) ? PRO_HABITS : FREE_HABITS;
}

/** Returns { habit } or { error: 'limit' | 'duplicate' }. */
function createHabit(userId, { name, emoji, target = 1, unit = null, weeklyTarget = null }) {
    getOrCreateUser(userId);
    const active = listHabits(userId);
    if (active.length >= getHabitLimit(userId)) return { error: 'limit' };
    const cleanName = String(name).trim().slice(0, 40);
    if (active.some(h => h.name.toLowerCase() === cleanName.toLowerCase())) return { error: 'duplicate' };

    const color = COLORS[active.length % COLORS.length];
    const result = db.prepare(`
        INSERT INTO habits (user_id, name, emoji, color, target, unit, weekly_target)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        userId,
        cleanName,
        (emoji || '✅').trim().slice(0, 16),
        color,
        Math.max(1, Math.min(1000, Math.floor(target) || 1)),
        unit ? String(unit).trim().slice(0, 16) : null,
        weeklyTarget ? Math.max(1, Math.min(7, Math.floor(weeklyTarget))) : null,
    );
    return { habit: getHabit(userId, result.lastInsertRowid) };
}

function archiveHabit(userId, habitId) {
    const info = db.prepare(`
        UPDATE habits SET archived_at = datetime('now')
        WHERE id = ? AND user_id = ? AND archived_at IS NULL
    `).run(habitId, userId);
    return info.changes > 0;
}

// ── Logging ───────────────────────────────────────────────────

/**
 * Adds `delta` to today's count (clamped at 0). The first time a habit reaches
 * its daily target on a day it pays a small Water reward, at most
 * DAILY_REWARD_CAP habits per day. Returns the updated state.
 */
function logHabit(userId, habitId, day, delta = 1) {
    return db.transaction(() => {
        const habit = getHabit(userId, habitId);
        if (!habit) return null;

        db.prepare(`
            INSERT INTO habit_logs (habit_id, user_id, day, count) VALUES (?, ?, ?, 0)
            ON CONFLICT(habit_id, day) DO NOTHING
        `).run(habitId, userId, day);
        const target = habit.target;
        const before = db.prepare('SELECT count, rewarded FROM habit_logs WHERE habit_id = ? AND day = ?').get(habitId, day);
        // Yes/no habits toggle; count habits never exceed their target by more than the target
        const next = target === 1
            ? (before.count >= 1 && delta > 0 ? 0 : Math.max(0, before.count + delta))
            : Math.max(0, Math.min(target * 2, before.count + delta));
        db.prepare(`
            UPDATE habit_logs SET count = ?, updated_at = datetime('now') WHERE habit_id = ? AND day = ?
        `).run(next, habitId, day);

        let rewarded = 0;
        if (next >= target && !before.rewarded) {
            const paidToday = db.prepare(`
                SELECT COUNT(*) AS n FROM habit_logs WHERE user_id = ? AND day = ? AND rewarded = 1
            `).get(userId, day).n;
            if (paidToday < DAILY_REWARD_CAP) {
                db.prepare('UPDATE habit_logs SET rewarded = 1 WHERE habit_id = ? AND day = ?').run(habitId, day);
                incrementUser(userId, 'water', REWARD_WATER);
                rewarded = REWARD_WATER;
            }
        }
        return { habit, count: next, done: next >= target, rewarded };
    })();
}

/** Map of habitId -> Map(day -> count) for days on or after `fromDay`. */
function getLogs(userId, fromDay) {
    const rows = db.prepare(`
        SELECT habit_id, day, count FROM habit_logs WHERE user_id = ? AND day >= ?
    `).all(userId, fromDay);
    const logs = new Map();
    for (const row of rows) {
        if (!logs.has(row.habit_id)) logs.set(row.habit_id, new Map());
        logs.get(row.habit_id).set(row.day, row.count);
    }
    return logs;
}

/** Map(day -> focus minutes) from Pomo sessions, in the given time zone. */
function getFocusDays(userId, timeZone, fromDay) {
    const fromUtc = `${shiftDay(fromDay, -1)} 00:00:00`;
    const rows = db.prepare(`
        SELECT created_at, minutes FROM activity_rewards
        WHERE user_id = ? AND minutes > 0 AND created_at >= ?
    `).all(userId, fromUtc);
    const days = new Map();
    for (const row of rows) {
        const day = localDay(timeZone, new Date(`${row.created_at.replace(' ', 'T')}Z`));
        if (day < fromDay) continue;
        days.set(day, (days.get(day) || 0) + row.minutes);
    }
    return days;
}

// ── Streaks ───────────────────────────────────────────────────

/**
 * Streaks for a set of completed days. Daily habits count consecutive days;
 * an unfinished today does not break the current streak. Weekly habits
 * (N days per week) count consecutive weeks that reached N.
 */
function computeStreaks(doneDays, today, weeklyTarget = null) {
    if (weeklyTarget) {
        const perWeek = new Map();
        for (const day of doneDays) {
            const week = weekStart(day);
            perWeek.set(week, (perWeek.get(week) || 0) + 1);
        }
        const metWeeks = new Set([...perWeek].filter(([, n]) => n >= weeklyTarget).map(([w]) => w));
        const thisWeek = weekStart(today);
        let current = 0;
        let cursor = metWeeks.has(thisWeek) ? thisWeek : shiftDay(thisWeek, -7);
        while (metWeeks.has(cursor)) { current++; cursor = shiftDay(cursor, -7); }
        return { current, best: longestRun([...metWeeks].sort(), 7), unit: 'week' };
    }

    let current = 0;
    let cursor = doneDays.has(today) ? today : shiftDay(today, -1);
    while (doneDays.has(cursor)) { current++; cursor = shiftDay(cursor, -1); }
    return { current, best: longestRun([...doneDays].sort(), 1), unit: 'day' };
}

function longestRun(sortedDays, stepDays) {
    let best = 0;
    let run = 0;
    let previous = null;
    for (const day of sortedDays) {
        run = previous && shiftDay(previous, stepDays) === day ? run + 1 : 1;
        best = Math.max(best, run);
        previous = day;
    }
    return best;
}

/**
 * Everything /habit view and /habit check need: the Pomo focus "habit" first,
 * then the user's habits, each with its per-day counts and streaks.
 */
function buildHabitOverview(userId, guildId = null, now = new Date()) {
    const timeZone = resolveTimeZone(userId, guildId);
    const today = localDay(timeZone, now);
    const fromDay = shiftDay(today, -(HISTORY_DAYS - 1));
    const logs = getLogs(userId, fromDay);

    const focusDays = getFocusDays(userId, timeZone, fromDay);
    const focusDone = new Set(focusDays.keys());
    const items = [{
        id: 'focus',
        name: 'Focus (Pomo)',
        emoji: '📚',
        color: '#e8a53a',
        target: 1,
        unit: 'min',
        weekly_target: null,
        counts: new Map([...focusDays].map(([day]) => [day, 1])),
        todayCount: focusDays.get(today) || 0,
        streaks: computeStreaks(focusDone, today),
        automatic: true,
    }];

    for (const habit of listHabits(userId)) {
        const counts = logs.get(habit.id) || new Map();
        const done = new Set([...counts].filter(([, n]) => n >= habit.target).map(([day]) => day));
        items.push({
            ...habit,
            counts,
            todayCount: counts.get(today) || 0,
            streaks: computeStreaks(done, today, habit.weekly_target),
            automatic: false,
        });
    }
    return { timeZone, today, fromDay, items };
}

module.exports = {
    FREE_HABITS,
    PRO_HABITS,
    getHabitLimit,
    DAILY_REWARD_CAP,
    HISTORY_DAYS,
    resolveTimeZone,
    setTimeZone,
    localDay,
    shiftDay,
    weekStart,
    listHabits,
    getHabit,
    createHabit,
    archiveHabit,
    logHabit,
    getLogs,
    getFocusDays,
    computeStreaks,
    buildHabitOverview,
};
