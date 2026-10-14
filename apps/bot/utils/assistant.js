/**
 * Pomo assistant: a Pro-only, opt-in helper that sends at most one DM a day.
 *
 * It does not repeat the reminders everyone already gets (morning nudge, 20:00
 * streak warning, weekly wrapped). Instead it uses the user's own history:
 *   1. exam coach    — 7, 3 and 1 days before an exam, with hours left vs target
 *   2. best hour     — at the hour (UTC) they focus most, if they haven't studied today
 *   3. comeback      — a regular (4+ days a week) who has been away for 2 days
 * Hours are compared in UTC and shown as Discord timestamps, so every user sees
 * their own local time without us knowing their timezone.
 */
const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const { db } = require('./database');
const { isFullPro } = require('./premiumManager');
const { t, getUserLanguage } = require('./i18n');
const { Colors } = require('./constants');

const EXAM_MILESTONES = [7, 3, 1];
const MIN_SESSIONS_FOR_BEST_HOUR = 5;
const HISTORY_DAYS = 30;

function ensureAssistantSchema() {
    // Additive only
    try { db.exec('ALTER TABLE users ADD COLUMN assistant_enabled INTEGER DEFAULT 0'); } catch (_) {}
    try { db.exec('ALTER TABLE users ADD COLUMN assistant_last_dm_date TEXT'); } catch (_) {}
    try { db.exec("ALTER TABLE users ADD COLUMN assistant_exam_alerts TEXT DEFAULT ''"); } catch (_) {}
}

const STUDY_FILTER = "completed = 1 AND title != '__break__'";

/** The UTC hour with the most focus minutes over the last 30 days, or null without enough history. */
function getBestHour(userId, now = new Date()) {
    const since = new Date(now.getTime() - HISTORY_DAYS * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    const rows = db.prepare(`
        SELECT CAST(strftime('%H', started_at) AS INTEGER) AS hour, SUM(duration) AS minutes, COUNT(*) AS sessions
        FROM study_sessions
        WHERE user_id = ? AND ${STUDY_FILTER} AND started_at >= ?
        GROUP BY hour ORDER BY minutes DESC
    `).all(userId, since);
    const sessions = rows.reduce((sum, r) => sum + r.sessions, 0);
    if (sessions < MIN_SESSIONS_FOR_BEST_HOUR) return null;
    return rows[0].hour;
}

function studiedOn(userId, day) {
    return Boolean(db.prepare(`
        SELECT 1 FROM study_sessions WHERE user_id = ? AND ${STUDY_FILTER} AND date(started_at) = ? LIMIT 1
    `).get(userId, day));
}

/** Distinct study days per week over the last 4 weeks, and days since the last study. */
function getRhythm(userId, now = new Date()) {
    const since = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10);
    const days = db.prepare(`
        SELECT DISTINCT date(started_at) AS day FROM study_sessions
        WHERE user_id = ? AND ${STUDY_FILTER} AND date(started_at) >= ?
        ORDER BY day DESC
    `).all(userId, since).map(r => r.day);
    const daysPerWeek = days.length / 4;
    const daysAway = days.length ? Math.floor((Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${days[0]}T00:00:00Z`)) / 86400000) : null;
    return { daysPerWeek, daysAway };
}

function studyHoursSince(userId, since) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(duration), 0) AS minutes FROM study_sessions
        WHERE user_id = ? AND ${STUDY_FILTER} AND started_at >= ?
    `).get(userId, since);
    return row.minutes / 60;
}

/** The exam milestone due today that hasn't been sent yet, if any. */
function dueExamAlert(userId, sentKeys, today) {
    const exams = db.prepare('SELECT * FROM user_exams WHERE user_id = ? AND exam_date > ? ORDER BY exam_date').all(userId, today);
    for (const exam of exams) {
        const daysLeft = Math.round((Date.parse(`${exam.exam_date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
        const key = `${exam.id}:${daysLeft}`;
        if (EXAM_MILESTONES.includes(daysLeft) && !sentKeys.includes(key)) {
            return { exam, daysLeft, key };
        }
    }
    return null;
}

/**
 * What to send this user right now, or null. One message a day at most;
 * the exam coach wins, then the best hour, then the comeback nudge.
 */
function pickNudge(user, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    if (user.assistant_last_dm_date === today) return null;
    const userId = user.discord_id;
    const sentKeys = (user.assistant_exam_alerts || '').split(',').filter(Boolean);

    // Exam coach goes out in the late afternoon (16:00 UTC), when most people plan the evening
    if (now.getUTCHours() === 16) {
        const due = dueExamAlert(userId, sentKeys, today);
        if (due) {
            const done = studyHoursSince(userId, due.exam.created_at);
            const target = Number(due.exam.target_hours || 0);
            const left = Math.max(0, target - done);
            return {
                kind: 'exam',
                examKey: due.key,
                vars: {
                    title: due.exam.title,
                    days: due.daysLeft,
                    done: done.toFixed(1),
                    target,
                    perDay: (left / due.daysLeft).toFixed(1),
                },
                key: target > 0 ? 'assistantExamBody' : 'assistantExamNoTargetBody',
            };
        }
    }

    if (studiedOn(userId, today)) return null;

    const bestHour = getBestHour(userId, now);
    if (bestHour !== null && bestHour === now.getUTCHours()) {
        return { kind: 'best_hour', key: 'assistantBestHourBody', vars: { time: `<t:${Math.floor(now.getTime() / 1000)}:t>` } };
    }

    // Comeback nudge in the evening (18:00 UTC) for regulars away for exactly 2 days
    if (now.getUTCHours() === 18) {
        const { daysPerWeek, daysAway } = getRhythm(userId, now);
        if (daysPerWeek >= 4 && daysAway === 2) {
            return { kind: 'comeback', key: 'assistantComebackBody', vars: { days: Math.round(daysPerWeek) } };
        }
    }
    return null;
}

/** The next time the given UTC hour comes round, as a Discord timestamp (shown in the user's local time). */
function nextOccurrence(utcHour, now = new Date()) {
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), utcHour));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return `<t:${Math.floor(next.getTime() / 1000)}:t>`;
}

function markSent(user, nudge, now = new Date()) {
    const today = now.toISOString().slice(0, 10);
    const keys = (user.assistant_exam_alerts || '').split(',').filter(Boolean);
    if (nudge.examKey) keys.push(nudge.examKey);
    // Keep the list short: old exam keys are useless once the exam is over
    db.prepare('UPDATE users SET assistant_last_dm_date = ?, assistant_exam_alerts = ? WHERE discord_id = ?')
        .run(today, keys.slice(-30).join(','), user.discord_id);
}

function buildNudgeEmbed(language, nudge) {
    return new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'assistantTitle'))
        .setDescription(t(language, nudge.key, nudge.vars))
        .setFooter({ text: t(language, 'assistantFooter') });
}

/** One pass over opted-in users. Returns how many DMs were sent. */
async function runAssistant(client, now = new Date()) {
    const users = db.prepare(`
        SELECT discord_id, assistant_last_dm_date, assistant_exam_alerts
        FROM users WHERE assistant_enabled = 1
    `).all();
    let sent = 0;
    for (const user of users) {
        // The assistant pauses on its own when Pro ends; the setting is kept for when it returns
        if (!isFullPro(user.discord_id)) continue;
        const nudge = pickNudge(user, now);
        if (!nudge) continue;
        const language = getUserLanguage(user.discord_id);
        const discordUser = await client.users.fetch(user.discord_id).catch(() => null);
        const delivered = discordUser
            ? await discordUser.send({ embeds: [buildNudgeEmbed(language, nudge)] }).then(() => true).catch(() => false)
            : false;
        // Mark even when DMs are closed, so a closed inbox isn't retried every hour
        markSent(user, nudge, now);
        if (delivered) sent++;
    }
    return sent;
}

function setAssistantEnabled(userId, enabled) {
    db.prepare('UPDATE users SET assistant_enabled = ? WHERE discord_id = ?').run(enabled ? 1 : 0, userId);
}

function isAssistantEnabled(userId) {
    return db.prepare('SELECT assistant_enabled FROM users WHERE discord_id = ?').get(userId)?.assistant_enabled === 1;
}

function startAssistantJob(client) {
    ensureAssistantSchema();
    cron.schedule('5 * * * *', async () => {
        try {
            const sent = await runAssistant(client);
            if (sent) console.log(`[ASSISTANT] Sent ${sent} nudge(s).`);
        } catch (err) {
            console.error('[ASSISTANT] Job error:', err.message);
        }
    });
    console.log('[ASSISTANT] Hourly assistant job started.');
}

module.exports = {
    ensureAssistantSchema,
    getBestHour,
    getRhythm,
    nextOccurrence,
    pickNudge,
    runAssistant,
    setAssistantEnabled,
    isAssistantEnabled,
    startAssistantJob,
};
