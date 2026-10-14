/**
 * Personal study insights (Pomo Pro), shown under /stats advanced.
 *
 * Built from all focus time (solo, team and voice) in the chosen period:
 *   - best hour       the UTC hour with the most focus, shown as a Discord timestamp
 *   - your week       average focus per weekday, strongest and weakest day
 *   - consistency     active days, longest run and longest break
 *   - trend           this period vs the one before it
 * Days and weekdays are counted in UTC, like the rest of /stats.
 */
const { EmbedBuilder } = require('discord.js');
const { db } = require('./database');
const { nextOccurrence } = require('./assistant');
const { t } = require('./i18n');
const { Colors } = require('./constants');

const MIN_SESSIONS_FOR_BEST_HOUR = 5;
const BAR_WIDTH = 8;
const DAY_MS = 86400000;

const dayKey = date => date.toISOString().slice(0, 10);

/** Every completed focus block between two dates (inclusive), with its UTC start and minutes. */
function getFocusBlocks(userId, startKey, endKey) {
    return db.prepare(`
        SELECT started_at, duration AS minutes FROM study_sessions
        WHERE user_id = ? AND completed = 1 AND title != '__break__'
          AND date(started_at) BETWEEN ? AND ?
        UNION ALL
        SELECT ts.started_at, ts.duration AS minutes
        FROM team_members tm JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE tm.user_id = ? AND ts.status = 'completed'
          AND date(ts.started_at) BETWEEN ? AND ?
        UNION ALL
        SELECT started_at, credited_minutes AS minutes FROM voice_sessions
        WHERE user_id = ? AND status = 'completed' AND credited_minutes > 0
          AND date(started_at) BETWEEN ? AND ?
    `).all(userId, startKey, endKey, userId, startKey, endKey, userId, startKey, endKey)
        .map(row => ({ ...row, minutes: Number(row.minutes || 0) }));
}

function windowKeys(periodDays, endDate) {
    const start = new Date(endDate.getTime() - (periodDays - 1) * DAY_MS);
    return { startKey: dayKey(start), endKey: dayKey(endDate), start };
}

function getInsights(userId, periodDays = 30, now = new Date()) {
    const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const { startKey, endKey, start } = windowKeys(periodDays, endDate);
    const blocks = getFocusBlocks(userId, startKey, endKey);
    const totalMinutes = blocks.reduce((sum, b) => sum + b.minutes, 0);

    // Best hour
    const byHour = new Map();
    for (const b of blocks) {
        const hour = Number(b.started_at.slice(11, 13));
        byHour.set(hour, (byHour.get(hour) || 0) + b.minutes);
    }
    let bestHour = null;
    if (blocks.length >= MIN_SESSIONS_FOR_BEST_HOUR && totalMinutes > 0) {
        const [hour, minutes] = [...byHour].sort((a, b) => b[1] - a[1])[0];
        bestHour = { hour, share: Math.round((minutes / totalMinutes) * 100) };
    }

    // Days in the window: minutes per day, and how many of each weekday (Monday = 0)
    const minutesByDay = new Map();
    for (const b of blocks) {
        const day = b.started_at.slice(0, 10);
        minutesByDay.set(day, (minutesByDay.get(day) || 0) + b.minutes);
    }
    const weekdayMinutes = Array(7).fill(0);
    const weekdayCount = Array(7).fill(0);
    let activeDays = 0, run = 0, longestRun = 0, gap = 0, longestGap = 0;
    for (let i = 0; i < periodDays; i++) {
        const date = new Date(start.getTime() + i * DAY_MS);
        const weekday = (date.getUTCDay() + 6) % 7;
        const minutes = minutesByDay.get(dayKey(date)) || 0;
        weekdayCount[weekday]++;
        weekdayMinutes[weekday] += minutes;
        if (minutes > 0) {
            activeDays++;
            run++;
            gap = 0;
        } else {
            gap++;
            run = 0;
        }
        longestRun = Math.max(longestRun, run);
        longestGap = Math.max(longestGap, gap);
    }
    const weekdays = weekdayMinutes.map((minutes, weekday) => ({
        weekday,
        avgMinutes: weekdayCount[weekday] ? minutes / weekdayCount[weekday] : 0,
    }));

    // The period before this one, same length
    const prevEnd = new Date(start.getTime() - DAY_MS);
    const prev = windowKeys(periodDays, prevEnd);
    const previousMinutes = getFocusBlocks(userId, prev.startKey, prev.endKey).reduce((sum, b) => sum + b.minutes, 0);

    return {
        periodDays,
        sessions: blocks.length,
        totalMinutes,
        previousMinutes,
        avgSession: blocks.length ? Math.round(totalMinutes / blocks.length) : 0,
        bestHour,
        weekdays,
        activeDays,
        longestRun,
        longestGap,
    };
}

function weekdayName(language, weekday) {
    // 2024-01-01 was a Monday
    const date = new Date(Date.UTC(2024, 0, 1 + weekday));
    let name;
    try {
        name = date.toLocaleDateString(language, { weekday: 'long', timeZone: 'UTC' });
    } catch (_) {
        name = date.toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' });
    }
    // Some locales (az, ru, fr...) write weekdays in lower case
    return name.charAt(0).toLocaleUpperCase(language) + name.slice(1);
}

const hours = minutes => (minutes / 60).toFixed(1);

function weekChart(language, weekdays) {
    const max = Math.max(...weekdays.map(d => d.avgMinutes));
    const names = weekdays.map(d => weekdayName(language, d.weekday));
    const width = Math.max(...names.map(n => n.length));
    return weekdays.map((d, i) => {
        const filled = max > 0 ? Math.round((d.avgMinutes / max) * BAR_WIDTH) : 0;
        return `${names[i].padEnd(width)} ${'▰'.repeat(filled)}${'▱'.repeat(BAR_WIDTH - filled)} ${hours(d.avgMinutes)}h`;
    }).join('\n');
}

function buildInsightsEmbed(language, insights, now = new Date()) {
    const { periodDays } = insights;
    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'insightsTitle', { days: periodDays }));

    if (!insights.sessions) {
        return embed.setDescription(t(language, 'insightsEmpty', { days: periodDays }));
    }

    const ranked = [...insights.weekdays].sort((a, b) => b.avgMinutes - a.avgMinutes);
    const change = insights.previousMinutes > 0
        ? Math.round(((insights.totalMinutes - insights.previousMinutes) / insights.previousMinutes) * 100)
        : null;

    const lines = [
        insights.bestHour
            ? t(language, 'insightsBestHour', { time: nextOccurrence(insights.bestHour.hour, now), share: insights.bestHour.share })
            : t(language, 'insightsBestHourNone'),
        '',
        t(language, 'insightsWeekTitle'),
        '```',
        weekChart(language, insights.weekdays),
        '```',
        t(language, 'insightsWeekSummary', {
            best: weekdayName(language, ranked[0].weekday),
            worst: weekdayName(language, ranked[ranked.length - 1].weekday),
        }),
        '',
        t(language, 'insightsConsistency', {
            active: insights.activeDays,
            days: periodDays,
            pct: Math.round((insights.activeDays / periodDays) * 100),
            run: insights.longestRun,
            gap: insights.longestGap,
        }),
        change === null
            ? t(language, 'insightsTrendNew', { days: periodDays })
            : t(language, 'insightsTrend', {
                change: `${change > 0 ? '+' : ''}${change}%`,
                days: periodDays,
                prev: hours(insights.previousMinutes),
                now: hours(insights.totalMinutes),
            }),
        t(language, 'insightsAvgSession', { minutes: insights.avgSession }),
    ];

    return embed
        .setDescription(lines.join('\n'))
        .setFooter({ text: t(language, 'insightsFooter') });
}

module.exports = {
    getInsights,
    buildInsightsEmbed,
};
