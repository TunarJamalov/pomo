/**
 * Timer Manager — Manages in-memory study/break timers.
 * Handles starting, cancelling, and recovering timers on restart.
 */

const {
    getOrCreateUser,
    updateUser,
    incrementUser,
    getActiveSessions,
    getActiveSessionForUser,
    completeSession,
    deleteSession,
    markReminderSent,
    getOrCreateSettings,
    getFriends,
    canNotifyFriend,
    awardPetXP,
    recordStreakBreak,
    recordActivityReward,
    getOrCreateGuildSettings,
    addFocusMinutesToTodo,
    getUserClan,
    recordGuildFocusProgress,
    getActiveChallengesForUser,
    updateChallengeProgress,
} = require('./database');
const { waterForMinutes, xpForMinutes, xpForLevel, Pets, PetMultipliers, Relics } = require('./constants');
const { studyEmbed, successEmbed, infoEmbed, progressBar, formatTime } = require('./embeds');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Colors } = require('./constants');
const { checkStudyAchievements } = require('./achievementChecker');
const { addGoalProgress } = require('./goalManager');
const { normalizeLanguage, t } = require('./i18n');
const { getStreakProgress } = require('./streakPolicy');
const { addFocusMinutesToExpedition } = require('./clanExpeditions');

const { generateSessionEndCard } = require('./canvas');

// Active timers: Map<sessionId, { completion: NodeJS.Timeout, reminder: NodeJS.Timeout | null, interval: NodeJS.Timeout | null }>
const activeTimers = new Map();
const MAX_PAUSE_COUNT = 3;
const MAX_PAUSE_MS = 15 * 60 * 1000;

/**
 * Parse a SQLite UTC datetime string into a JS Date.
 * SQLite's datetime('now') returns 'YYYY-MM-DD HH:MM:SS' in UTC but without 'Z'.
 * JS new Date() treats no-timezone strings as local time, causing offset bugs.
 */
function parseUTC(sqliteDatetime) {
    if (!sqliteDatetime) return new Date(0);
    // Append 'Z' if not already a full ISO string
    const str = sqliteDatetime.includes('T') ? sqliteDatetime : sqliteDatetime.replace(' ', 'T') + 'Z';
    return new Date(str);
}

/**
 * "[Cycle 2/4] Title" for pomodoro sessions, just the title otherwise.
 */
function formatCycleTitle(language, session, sessionTitle) {
    if (!session.pomodoro_data) return sessionTitle;
    const pomData = JSON.parse(session.pomodoro_data);
    return t(language, 'pomodoroStartTitle', {
        cycle: pomData.cycle,
        cycles: pomData.maxCycles,
        title: sessionTitle,
    });
}

/**
 * Start a study session timer.
 * @param {boolean} isNew - Whether this is a newly created session (triggers friend notifications).
 */
// A completion timer may fire a little early or late; within this it counts as on time
const END_TOLERANCE_MS = 5000;

function startStudyTimer(client, session, isNew = false) {
    const now = Date.now();
    if (Number(session.paused || 0) === 1) {
        schedulePausedSessionCancel(client, session);
        return;
    }

    const endsAt = parseUTC(session.ends_at).getTime();
    const remainingMs = endsAt - now;
    const language = getSessionLanguage(session);
    const sessionTitle = session.title || t(language, 'studySession');

    if (remainingMs <= 0) {
        // Already expired, complete immediately
        handleSessionComplete(client, session);
        return;
    }

    // Prevent duplicate timers for the same session
    if (activeTimers.has(session.id)) {
        console.warn(`[TIMER] Session ${session.id} already has active timers. Clearing old ones first.`);
        clearTimers(session.id);
    }

    if (isNew) {
        notifyFriendsOfStudy(client, session);
    }

    const timers = {};
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;

    // ─── Progress update interval (every 60 seconds) ─────────
    // True while this set of timers is the session's current one (pause/resume replace it)
    const isCurrent = () => activeTimers.get(session.id) === timers;

    timers.interval = setInterval(async () => {
        try {
            const live = getSessionById(session.id);
            if (!isCurrent() || !live || Number(live.completed || 0) === 1 || Number(live.paused || 0) === 1) {
                clearInterval(timers.interval);
                return;
            }
            const nowMs = Date.now();
            const endMs = parseUTC(live.ends_at).getTime();

            // Safety: if we're past the end time, the completion timer must have failed
            if (nowMs >= endMs + 60000) {
                console.warn(`[TIMER] Session ${session.id} overran end time. Force-completing.`);
                handleSessionComplete(client, live);
                return;
            }

            const elapsed = Math.floor((nowMs - parseUTC(live.started_at).getTime()) / 1000 / 60);
            const remaining = Math.max(0, Math.ceil((endMs - nowMs) / 1000 / 60));
            const total = session.duration;

            const embed = new EmbedBuilder()
                .setColor(Colors.STUDY)
                .setTitle(`📚 ${formatCycleTitle(language, session, sessionTitle)}`)
                .setDescription(
                    `**${t(language, 'durationLabel')}:** ${formatTime(total)}\n` +
                    `**${t(language, 'elapsedLabel')}:** ${formatTime(elapsed)}\n` +
                    `**${t(language, 'remainingLabel')}:** ${formatTime(remaining)}\n\n` +
                    `${progressBar(elapsed, total, 20)}`
                )
                .setFooter({ text: `Session ID: ${session.id}` })
                .setTimestamp();

            const channel = await client.channels.fetch(session.channel_id).catch(() => null);
            if (!channel) {
                console.warn(`[TIMER] Channel ${session.channel_id} inaccessible for session ${session.id}. Stopping interval.`);
                const t = activeTimers.get(session.id);
                if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                return;
            }
            if (session.message_id) {
                const message = await channel.messages.fetch(session.message_id).catch(() => null);
                // Fetching can take seconds when Discord is slow; if the user paused meanwhile,
                // this running view must not replace the paused one
                const stillRunning = getSessionById(session.id);
                if (!isCurrent() || !stillRunning || Number(stillRunning.paused || 0) === 1 || Number(stillRunning.completed || 0) === 1) {
                    return;
                }
                if (message) {
                    await message.edit({ embeds: [embed] }).catch((err) => {
                        if (err.code === 50001 || err.status === 403 || err.code === 10008) {
                            console.warn(`[TIMER] Missing Access/Unknown Message on session ${session.id}. Stopping interval.`);
                            const t = activeTimers.get(session.id);
                            if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                        } else {
                            console.error(`[TIMER] Failed to edit message for session ${session.id}:`, err.message);
                        }
                    });
                } else {
                    console.warn(`[TIMER] Message ${session.message_id} deleted for session ${session.id}. Stopping interval.`);
                    const t = activeTimers.get(session.id);
                    if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                }
            }
            consecutiveErrors = 0; // Reset on success
        } catch (err) {
            consecutiveErrors++;
            console.error(`[TIMER] Interval error for session ${session.id} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, err.message);
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error(`[TIMER] Too many consecutive errors for session ${session.id}. Force-completing.`);
                handleSessionComplete(client, session);
            }
        }
    }, 60 * 1000);

    // ─── 5-minute reminder ─────────────────────────────────
    const reminderMs = remainingMs - 5 * 60 * 1000;
    if (reminderMs > 0 && !session.reminder_sent) {
        timers.reminder = setTimeout(async () => {
            try {
                markReminderSent(session.id);
                const settings = getOrCreateSettings(session.user_id);

                if (!settings.reminders_enabled) return;

                const embed = infoEmbed(
                    t(language, 'almostDoneTitle'),
                    `⏰ ${t(language, 'almostDoneBody', { title: sessionTitle })}`
                );

                if (settings.notify_type === 'dm') {
                    const user = await client.users.fetch(session.user_id).catch(() => null);
                    if (user) await user.send({ embeds: [embed] }).catch(() => { });
                } else {
                    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
                    if (channel) {
                        await channel.send({ content: `<@${session.user_id}>`, embeds: [embed] }).catch(() => { });
                    }
                }
            } catch (err) {
                console.error('[TIMER] Reminder error:', err.message);
            }
        }, reminderMs);
    }

    // ─── Completion timer ──────────────────────────────────
    timers.completion = setTimeout(() => {
        handleSessionComplete(client, session);
    }, remainingMs);

    // ─── Hard safety timeout (duration + 5 min) ───────────
    // Catches ANY case where the completion timer somehow fails
    timers.safety = setTimeout(() => {
        if (isCurrent()) {
            console.warn(`[TIMER] Safety timeout triggered for session ${session.id}. Force-completing.`);
            handleSessionComplete(client, session);
        }
    }, remainingMs + 5 * 60 * 1000);

    activeTimers.set(session.id, timers);
}

/**
 * Start a break timer (no rewards).
 */
function startBreakTimer(client, session) {
    const now = Date.now();
    const endsAt = parseUTC(session.ends_at).getTime();
    const remainingMs = endsAt - now;
    const language = getSessionLanguage(session);

    if (remainingMs <= 0) {
        handleBreakComplete(client, session);
        return;
    }

    const timers = {};

    // ─── Progress update interval ────────────────────────────
    timers.interval = setInterval(async () => {
        try {
            const nowMs = Date.now();
            const endMs = parseUTC(session.ends_at).getTime();
            const elapsed = Math.floor((nowMs - parseUTC(session.started_at).getTime()) / 1000 / 60);
            const remaining = Math.max(0, Math.ceil((endMs - nowMs) / 1000 / 60));
            const total = session.duration;

            const embed = new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`☕ ${t(language, 'breakTimeTitle')}`)
                .setDescription(
                    `**${t(language, 'durationLabel')}:** ${formatTime(total)}\n` +
                    `**${t(language, 'elapsedLabel')}:** ${formatTime(elapsed)}\n` +
                    `**${t(language, 'remainingLabel')}:** ${formatTime(remaining)}\n\n` +
                    `${progressBar(elapsed, total, 20)}`
                )
                .setFooter({ text: t(language, 'breakTimeFooter') })
                .setTimestamp();

            const channel = await client.channels.fetch(session.channel_id).catch(() => null);
            if (!channel) {
                console.warn(`[TIMER] Break channel ${session.channel_id} inaccessible for session ${session.id}. Stopping interval.`);
                const t = activeTimers.get(session.id);
                if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                return;
            }
            if (session.message_id) {
                const message = await channel.messages.fetch(session.message_id).catch(() => null);
                if (message) {
                    await message.edit({ embeds: [embed] }).catch((err) => {
                        if (err.code === 50001 || err.status === 403) {
                            console.warn(`[TIMER] Missing Access on break session ${session.id}. Stopping interval.`);
                            const t = activeTimers.get(session.id);
                            if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                        } else {
                            console.error(`[TIMER] Break edit failed [S:${session.id}]:`, err.message);
                        }
                    });
                } else {
                    const t = activeTimers.get(session.id);
                    if (t?.interval) { clearInterval(t.interval); t.interval = null; }
                }
            }
        } catch (err) {
            console.error(`[TIMER] Break interval error for session ${session.id}:`, err);
        }
    }, 60 * 1000);

    // ─── Completion timer ──────────────────────────────────
    timers.completion = setTimeout(() => {
        handleBreakComplete(client, session);
    }, remainingMs);

    activeTimers.set(session.id, timers);
}

/**
 * Handle study session completion — award water, XP, update streak.
 */

const { handleSessionComplete: _handleSessionComplete } = require('./timer/sessionComplete');
async function handleSessionComplete(client, session) {
    // Timers keep the session as it was when they started. Pausing or resuming changes
    // it since, so decide from the database: a paused session never finishes (its pause
    // timeout handles it), and one whose end moved later goes back on the clock.
    const current = getSessionById(session.id);
    if (!current || Number(current.completed || 0) === 1) return;
    if (Number(current.paused || 0) === 1) return;
    if (parseUTC(current.ends_at).getTime() - Date.now() > END_TOLERANCE_MS) {
        startStudyTimer(client, current);
        return;
    }
    return _handleSessionComplete(client, current, {
        clearTimers,
        parseUTC,
        startBreakTimer,
        getSessionLanguage
    });
}


/**
 * Handle break completion (no rewards).
 */
async function handleBreakComplete(client, session) {
    try {
        clearTimers(session.id);
        // Only the first completion starts the next work cycle
        if (completeSession(session.id) === false) return;
        const language = getSessionLanguage(session);

        const embed = successEmbed(t(language, 'breakOverTitle'), `☕ ${t(language, 'breakOverBody')} 💪`);

        const channel = await client.channels.fetch(session.channel_id).catch(() => null);
        if (channel) {
            await channel.send({
                content: `<@${session.user_id}>`,
                embeds: [embed],
            }).catch(() => { });

            if (session.message_id) {
                const message = await channel.messages.fetch(session.message_id).catch(() => null);
                if (message) {
                    const doneEmbed = new EmbedBuilder()
                        .setColor(Colors.SUCCESS)
                        .setTitle(`✅ ${t(language, 'breakCompletedTitle')}`)
                        .setDescription(`${progressBar(1, 1, 20)}\n\n${t(language, 'breakFinishedShort')}`)
                        .setTimestamp();
                    await message.edit({ embeds: [doneEmbed], components: [] }).catch(() => { });
                }
            }

            // --- Pomodoro Auto-Transition: Break → Work ---
            if (session.pomodoro_data) {
                const pomData = JSON.parse(session.pomodoro_data);
                if (pomData.type === 'break' && pomData.cycle < pomData.maxCycles) {
                    const nextCycle = pomData.cycle + 1;
                    const { createSession, updateSessionPomodoroData, getActiveSessionForUser } = require('./database');
                    const newSessionId = createSession(session.user_id, session.guild_id, session.channel_id, session.message_id, pomData.work, pomData.originalTitle || 'Pomodoro Work');
                    updateSessionPomodoroData(newSessionId, { ...pomData, cycle: nextCycle, type: 'work' });
                    const newSession = getActiveSessionForUser(session.user_id);
                    
                    await channel.send(`🍅 <@${session.user_id}> ${t(language, 'sessionBonusPomodoroBreakOver', { cycle: nextCycle, maxCycles: pomData.maxCycles, minutes: pomData.work })} 💪`).catch(() => {});
                    if (newSession) {
                        startStudyTimer(client, newSession);
                    } else {
                        console.error(`[TIMER] Auto-transition failed: no active session found for user ${session.user_id} after work createSession`);
                    }
                }
            }
        }
    } catch (err) {
        console.error('[TIMER] Break complete error:', err);
    }
}

/**
 * Cancel an active session.
 */
function cancelSession(sessionId) {
    clearTimers(sessionId);
    deleteSession(sessionId);
}

function getSessionById(sessionId) {
    const { db } = require('./database');
    return db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId);
}

function canPauseStudySession(session) {
    if (!session || session.completed === 1) return { ok: false, reason: 'not_found' };
    if (session.title === '__break__') return { ok: false, reason: 'break' };
    if (session.pomodoro_data) return { ok: false, reason: 'pomodoro' };
    if (Number(session.paused || 0) === 1) return { ok: false, reason: 'already_paused' };
    if (Number(session.pause_count || 0) >= MAX_PAUSE_COUNT) return { ok: false, reason: 'limit' };
    return { ok: true };
}

async function pauseStudySession(client, session) {
    const validation = canPauseStudySession(session);
    if (!validation.ok) return validation;

    clearTimers(session.id);
    const { db } = require('./database');
    const pausedAt = new Date();
    db.prepare(`
        UPDATE study_sessions
        SET paused = 1,
            paused_at = ?,
            pause_count = COALESCE(pause_count, 0) + 1
        WHERE id = ? AND completed = 0
    `).run(toSqliteDateTime(pausedAt), session.id);

    const updated = getSessionById(session.id);
    schedulePausedSessionCancel(client, updated);
    // Refresh the timer message in the background so the command replies fast
    updateStudyMessage(client, updated, 'paused').catch(() => {});
    return { ok: true, session: updated };
}

async function resumeStudySession(client, session) {
    if (!session || session.completed === 1) return { ok: false, reason: 'not_found' };
    if (session.title === '__break__') return { ok: false, reason: 'break' };
    if (session.pomodoro_data) return { ok: false, reason: 'pomodoro' };
    if (Number(session.paused || 0) !== 1 || !session.paused_at) {
        return { ok: false, reason: 'not_paused' };
    }

    const pausedAt = parseUTC(session.paused_at);
    const now = new Date();
    const pausedSeconds = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000));
    if (pausedSeconds * 1000 > MAX_PAUSE_MS) {
        await cancelPausedSession(client, session, 'pause_timeout');
        return { ok: false, reason: 'timeout' };
    }

    clearTimers(session.id);
    const { db } = require('./database');
    const startedAt = parseUTC(session.started_at);
    const endsAt = parseUTC(session.ends_at);
    const shiftedStart = new Date(startedAt.getTime() + pausedSeconds * 1000);
    const shiftedEnd = new Date(endsAt.getTime() + pausedSeconds * 1000);
    db.prepare(`
        UPDATE study_sessions
        SET paused = 0,
            paused_at = NULL,
            paused_total_seconds = COALESCE(paused_total_seconds, 0) + ?,
            started_at = ?,
            ends_at = ?
        WHERE id = ? AND completed = 0
    `).run(pausedSeconds, toSqliteDateTime(shiftedStart), toSqliteDateTime(shiftedEnd), session.id);

    const updated = getSessionById(session.id);
    updateStudyMessage(client, updated, 'resumed').catch(() => {});
    startStudyTimer(client, updated);
    return { ok: true, session: updated };
}

function schedulePausedSessionCancel(client, session) {
    clearTimers(session.id);
    const pausedAtMs = parseUTC(session.paused_at).getTime();
    const remainingPauseMs = Math.max(0, MAX_PAUSE_MS - (Date.now() - pausedAtMs));
    const pauseCancel = setTimeout(async () => {
        const current = getSessionById(session.id);
        if (!current || current.completed || Number(current.paused || 0) !== 1) return;
        await cancelPausedSession(client, current, 'pause_timeout');
    }, remainingPauseMs);
    activeTimers.set(session.id, { pauseCancel });
}

async function cancelPausedSession(client, session, reason = 'pause_timeout') {
    clearTimers(session.id);
    deleteSession(session.id);

    const language = getSessionLanguage(session);
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (!channel) return;

    if (session.message_id) {
        const message = await channel.messages.fetch(session.message_id).catch(() => null);
        if (message) {
            const embed = new EmbedBuilder()
                .setColor(Colors.WARNING)
                .setTitle(t(language, 'sessionAutoCancelledTitle'))
                .setDescription(t(language, reason === 'pause_timeout' ? 'pauseTimeoutCancelledBody' : 'cancelSessionMessageBody'))
                .setTimestamp();
            await message.edit({ embeds: [embed], components: [] }).catch(() => {});
        }
    }

    await channel.send({
        content: `<@${session.user_id}>`,
        embeds: [infoEmbed(t(language, 'sessionAutoCancelledTitle'), t(language, 'pauseTimeoutCancelledBody'))],
    }).catch(() => {});
}

async function updateStudyMessage(client, session, mode) {
    const language = getSessionLanguage(session);
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (!channel || !session.message_id) return;
    const message = await channel.messages.fetch(session.message_id).catch(() => null);
    if (!message) return;

    const embed = buildStudyProgressEmbed(session, language);
    if (mode === 'paused') {
        embed.addFields({
            name: t(language, 'pauseLimitField'),
            value: t(language, 'pauseLimitBody', { minutes: Math.floor(MAX_PAUSE_MS / 60000) }),
            inline: false,
        });
    }
    await message.edit({
        embeds: [embed],
        components: [buildStudyControlRow(session, language)],
    }).catch(() => {});
}

/**
 * Clear all timers for a session.
 */
function clearTimers(sessionId) {
    const timers = activeTimers.get(sessionId);
    if (timers) {
        if (timers.completion) clearTimeout(timers.completion);
        if (timers.reminder) clearTimeout(timers.reminder);
        if (timers.interval) clearInterval(timers.interval);
        if (timers.safety) clearTimeout(timers.safety);
        if (timers.pauseCancel) clearTimeout(timers.pauseCancel);
        activeTimers.delete(sessionId);
    }
}

/**
 * Recover active sessions from DB on bot restart.
 */
function recoverSessions(client) {
    const sessions = getActiveSessions();
    let recovered = 0;

    for (const session of sessions) {
        if (Number(session.paused || 0) === 1) {
            const pausedAtMs = parseUTC(session.paused_at).getTime();
            if (Date.now() - pausedAtMs >= MAX_PAUSE_MS) {
                cancelPausedSession(client, session, 'pause_timeout');
            } else {
                schedulePausedSessionCancel(client, session);
                recovered++;
            }
            continue;
        }

        const endsAt = parseUTC(session.ends_at).getTime();
        const now = Date.now();

        if (endsAt <= now) {
            // Expired during downtime — figure out if it's a study or break
            if (session.title === '__break__') {
                handleBreakComplete(client, session);
            } else {
                handleSessionComplete(client, session);
            }
        } else {
            // Still active — restart the timer
            if (session.title === '__break__') {
                startBreakTimer(client, session);
            } else {
                startStudyTimer(client, session);
            }
            recovered++;
        }
    }

    if (sessions.length > 0) {
        console.log(`[TIMER] Recovered ${recovered} active session(s), completed ${sessions.length - recovered} expired session(s).`);
    }
}

/**
 * Notify friends that a user started studying.
 */
async function notifyFriendsOfStudy(client, session) {
    try {
        const friends = getFriends(session.user_id);
        if (!friends || friends.length === 0) return;
        const language = getSessionLanguage(session);
        const sessionTitle = session.title || t(language, 'studySession');

        const embed = infoEmbed(
            t(language, 'friendStartedTitle'),
            `${t(language, 'friendStartedBody', {
                userId: session.user_id,
                title: sessionTitle,
                minutes: session.duration,
            })} 💪`
        );

        for (const friendId of friends) {
            if (canNotifyFriend(friendId)) {
                const user = await client.users.fetch(friendId).catch(() => null);
                if (user) {
                    await user.send({ embeds: [embed] }).catch(() => {
                        // User might have DMs disabled
                    });
                }
            }
        }
    } catch (err) {
        console.error('[TIMER] Failed to notify friends:', err);
    }
}

/**
 * Check if a user has an active session.
 */
function hasActiveSession(userId) {
    return !!getActiveSessionForUser(userId);
}

function toSqliteDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getEffectiveTiming(session, nowMs = Date.now()) {
    const startedMs = parseUTC(session.started_at).getTime();
    const endMs = parseUTC(session.ends_at).getTime();
    const pausedAtMs = session.paused_at ? parseUTC(session.paused_at).getTime() : nowMs;
    const referenceMs = Number(session.paused || 0) === 1 ? pausedAtMs : nowMs;
    const elapsedMs = Math.max(0, referenceMs - startedMs);
    const remainingMs = Math.max(0, endMs - referenceMs);

    return {
        elapsedMinutes: Math.min(session.duration, Math.floor(elapsedMs / 60000)),
        remainingMinutes: Math.max(0, Math.ceil(remainingMs / 60000)),
        remainingMs,
        endMs,
    };
}

// First-time users can shorten their first session to a quick taste
const TRIAL_MINUTES = 5;

/** True while a brand-new user's first focus session can still be shortened. */
function isTrialEligible(session) {
    if (!session?.user_id || !session.id) return false;
    if (session.title === '__break__' || Number(session.duration) <= TRIAL_MINUTES) return false;
    if (Number(session.completed || 0) === 1 || Number(session.paused || 0) === 1) return false;
    const { db } = require('./database');
    const user = db.prepare('SELECT total_sessions FROM users WHERE discord_id = ?').get(session.user_id);
    if (Number(user?.total_sessions || 0) > 0) return false;
    const done = db.prepare(`
        SELECT 1 FROM study_sessions
        WHERE user_id = ? AND completed = 1 AND COALESCE(title, '') != '__break__'
        LIMIT 1
    `).get(session.user_id);
    return !done;
}

function buildTrialButton(session, language = 'en') {
    return new ButtonBuilder()
        .setCustomId(`trial_study_${session.id}`)
        .setLabel(t(language, 'trialButton'))
        .setStyle(ButtonStyle.Primary)
        .setEmoji('⚡');
}

/**
 * Turn a new user's running session into a single 5-minute session so they see
 * the full completion (rewards, card, streak) before deciding about the bot.
 */
async function shortenToTrialSession(client, sessionId, userId) {
    const { db } = require('./database');
    const session = getSessionById(sessionId);
    if (!session || session.user_id !== userId || !isTrialEligible(session)) return { ok: false };

    const startedMs = parseUTC(session.started_at).getTime();
    const pausedMs = Number(session.paused_total_seconds || 0) * 1000;
    const endsAt = new Date(Math.max(startedMs + pausedMs + TRIAL_MINUTES * 60000, Date.now() + 60000));

    clearTimers(session.id);
    db.prepare(`
        UPDATE study_sessions
        SET duration = ?, ends_at = ?, pomodoro_data = NULL
        WHERE id = ? AND completed = 0
    `).run(TRIAL_MINUTES, toSqliteDateTime(endsAt), session.id);

    const updated = getSessionById(session.id);
    startStudyTimer(client, updated);
    updateStudyMessage(client, updated, 'resumed').catch(() => {});
    return { ok: true, endsAt };
}

function buildStudyControlRow(session, language = 'en') {
    const paused = Number(session?.paused || 0) === 1;
    const trial = isTrialEligible(session) ? [buildTrialButton(session, language)] : [];
    return new ActionRowBuilder().addComponents(
        ...trial,
        new ButtonBuilder()
            .setCustomId(`cancel_study_${session.id}`)
            .setLabel(t(language, 'cancelSession'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji('⏹️'),
        new ButtonBuilder()
            .setCustomId(`${paused ? 'resume' : 'pause'}_study_${session.id}`)
            .setLabel(paused ? t(language, 'resumeSessionButton') : t(language, 'pauseSessionButton'))
            .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji(paused ? '▶️' : '⏸️')
    );
}

function buildStudyProgressEmbed(session, language = 'en', options = {}) {
    const nowMs = options.nowMs || Date.now();
    const sessionTitle = session.title || t(language, 'studySession');
    const timing = getEffectiveTiming(session, nowMs);
    const paused = Number(session.paused || 0) === 1;
    const pauseLine = paused
        ? `\n**${t(language, 'pausedLabel')}:** ${t(language, 'pausedStatusLine')}\n`
        : '';

    return new EmbedBuilder()
        .setColor(paused ? Colors.WARNING : Colors.STUDY)
        .setTitle(`${paused ? '⏸️' : '📚'} ${formatCycleTitle(language, session, sessionTitle)}`)
        .setDescription(
            `**${t(language, 'durationLabel')}:** ${formatTime(session.duration)}\n` +
            `**${t(language, 'elapsedLabel')}:** ${formatTime(timing.elapsedMinutes)}\n` +
            `**${t(language, 'remainingLabel')}:** ${formatTime(timing.remainingMinutes)}\n` +
            pauseLine +
            `\n${progressBar(timing.elapsedMinutes, session.duration, 20)}`
        )
        .setFooter({ text: `Session ID: ${session.id}` })
        .setTimestamp();
}

function getSessionLanguage(session) {
    if (!session?.guild_id) return 'en';
    try {
        const settings = getOrCreateGuildSettings(session.guild_id);
        return normalizeLanguage(settings.language || 'en');
    } catch {
        return 'en';
    }
}

module.exports = {
    startStudyTimer,
    startBreakTimer,
    cancelSession: cancelSession,
    pauseStudySession,
    resumeStudySession,
    buildStudyControlRow,
    buildTrialButton,
    isTrialEligible,
    shortenToTrialSession,
    recoverSessions,
    hasActiveSession,
    clearTimers,
};
