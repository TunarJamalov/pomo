/**
 * /team [minutes] [limit] — Host a team study session.
 * Creates a lobby with Join button; host clicks Start when ready.
 * All members study together and earn water on completion.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed, formatTime, progressBar } = require('../utils/embeds');
const {
    getOrCreateUser,
    db,
    incrementUser,
    updateUser,
    updateTeamSessionPomodoroData,
    awardPetXP,
    getOrCreateSettings,
    isUserInAnyActiveSession,
    recordActivityReward,
} = require('../utils/database');
const { waterForMinutes, xpForMinutes, xpForLevel, Pets, petBuffMultiplier } = require('../utils/constants');
const { checkStudyAchievements, checkTeamAchievements } = require('../utils/achievementChecker');
const { addGoalProgress } = require('../utils/goalManager');
const { getInteractionLanguage, getGuildLanguage, t } = require('../utils/i18n');
const { applyStudyStreak, recordSessionActivity } = require('../utils/studyStreak');
const { applyWaterDoubler } = require('../utils/rewardBoosts');

/** Parse SQLite UTC datetime (no 'Z' suffix) into JS Date */
function parseUTC(dt) {
    if (!dt) return new Date(0);
    return new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z');
}

// In-memory tracking for active team sessions and their timers
const activeTeamSessions = new Map();
const activeTeamTimers = new Map();
const MAX_TEAM_PAUSE_COUNT = 3;
const MAX_TEAM_PAUSE_MS = 15 * 60 * 1000;

function clearTeamTimers(sessionId) {
    const timers = activeTeamTimers.get(sessionId);
    if (timers) {
        if (timers.reminder) clearTimeout(timers.reminder);
        if (timers.completion) clearTimeout(timers.completion);
        if (timers.interval) clearInterval(timers.interval);
        if (timers.pauseCancel) clearTimeout(timers.pauseCancel);
        activeTeamTimers.delete(sessionId);
    }
}

function toSqliteDateTime(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

function getTeamLanguage(session, fallback = 'en') {
    return getGuildLanguage(session?.guild_id, fallback);
}

function cycleLabel(language, type) {
    return type === 'break' ? t(language, 'teamBreak') : t(language, 'teamWork');
}

function formatPomodoroPrefix(language, pomData) {
    if (!pomData) return '';
    return `**${t(language, 'pomodoroStartTitle', {
        cycle: pomData.cycle,
        cycles: pomData.maxCycles,
        title: cycleLabel(language, pomData.type),
    })}**\n`;
}

function buildTimeoutEmbed(language, titleKey = 'teamTimedOutTitle') {
    return new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(`⏰ ${t(language, titleKey)}`)
        .setDescription(t(language, 'teamTimedOutBody'))
        .setTimestamp();
}

function buildProgressDescription(language, pomPrefix, duration, elapsed, remaining, memberCount) {
    return (
        pomPrefix +
        `**${t(language, 'durationLabel')}:** ${formatTime(duration)}\n` +
        `**${t(language, 'elapsedLabel')}:** ${formatTime(elapsed)} | **${t(language, 'remainingLabel')}:** ${formatTime(remaining)}\n` +
        `**${t(language, 'teamMembers')}:** ${memberCount}\n\n` +
        `${progressBar(elapsed, duration, 20)}`
    );
}

function buildLocalizedLobbyEmbed(sessionId, hostName, members, limit, minutes, autoLaunch, language = 'en') {
    const memberList = members.map((id, i) => `${i === 0 ? '👑' : '👤'} <@${id}>`).join('\n');

    const session = db.prepare('SELECT pomodoro_data, sound_alert FROM team_sessions WHERE id = ?').get(sessionId);
    let pomText = '';
    if (session && session.pomodoro_data) {
        const pom = JSON.parse(session.pomodoro_data);
        pomText = `**${t(language, 'teamMode')}:** 🍅 Pomodoro (${pom.work}m ${t(language, 'teamWork')} / ${pom.break}m ${t(language, 'teamBreak')} x${pom.maxCycles})\n`;
    }

    return new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`📚 ${t(language, 'teamLobbyTitle')}`)
        .setDescription(
            `**${t(language, 'teamHost')}:** ${hostName}\n` +
            `**${t(language, 'teamRoomCode')}:** \`${sessionId}\` (${t(language, 'teamRoomCodeHint')})\n` +
            `**${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
            pomText +
            (session?.sound_alert ? `🔔 ${t(language, 'pomodoroSoundLine')}\n` : '') +
            `**${t(language, 'teamPlayers')}:** ${members.length}/${limit}\n\n` +
            `**${t(language, 'teamMembers')}:**\n${memberList}\n\n` +
            `*${t(language, 'teamWaiting')}*\n` +
            `**${t(language, 'teamAutoLaunch')}:** ${autoLaunch ? `✅ ${t(language, 'teamAutoLaunchOn')}` : `❌ ${t(language, 'teamAutoLaunchOff')}`}`
        )
        .setTimestamp();
}

function buildLocalizedLobbyButtons(sessionId, autoLaunch, language = 'en') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`team_join_${sessionId}`)
            .setLabel(t(language, 'teamJoinButton'))
            .setStyle(ButtonStyle.Success)
            .setEmoji('✋'),
        new ButtonBuilder()
            .setCustomId(`team_start_${sessionId}`)
            .setLabel(t(language, 'teamStartButton'))
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️'),
        new ButtonBuilder()
            .setCustomId(`team_cancel_${sessionId}`)
            .setLabel(t(language, 'teamCancelButton'))
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✖️'),
        new ButtonBuilder()
            .setCustomId(`team_autolaunch_${sessionId}`)
            .setLabel(t(language, 'teamAutoLaunch'))
            .setStyle(autoLaunch ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setEmoji('🚀'),
    );
}

function buildTeamStartedEmbed(language, isBreak, pomPrefix, minutes, memberCount, memberMentions) {
    return new EmbedBuilder()
        .setColor(isBreak ? Colors.INFO : Colors.STUDY)
        .setTitle(`${isBreak ? '☕' : '📚'} ${t(language, 'teamStartedTitle')}`)
        .setDescription(
            pomPrefix +
            `**${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
            `**${t(language, 'teamMembers')}:** ${memberCount}\n\n` +
            `${memberMentions}\n\n` +
            `${progressBar(0, minutes, 20)}\n\n` +
            `*${t(language, 'teamStudyHard')}*`
        )
        .setTimestamp();
}

function buildTeamControlRow(session, language = 'en') {
    const paused = Number(session?.paused || 0) === 1;
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`team_join_${session.id}`)
            .setLabel(t(language, 'joinTeamButton') || 'Join')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`${paused ? 'team_resume' : 'team_pause'}_${session.id}`)
            .setLabel(paused ? t(language, 'resumeSessionButton') : t(language, 'pauseSessionButton'))
            .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`team_cancel_${session.id}`)
            .setLabel(t(language, 'teamCancelButton'))
            .setStyle(ButtonStyle.Danger)
    );
}

function getEffectiveTeamTiming(session, nowMs = Date.now()) {
    const startedMs = parseUTC(session.started_at).getTime();
    const endMs = parseUTC(session.ends_at).getTime();
    const pausedAtMs = session.paused_at ? parseUTC(session.paused_at).getTime() : nowMs;
    const referenceMs = Number(session.paused || 0) === 1 ? pausedAtMs : nowMs;
    const elapsedMs = Math.max(0, referenceMs - startedMs);
    const remainingMs = Math.max(0, endMs - referenceMs);

    return {
        elapsed: Math.min(session.duration, Math.floor(elapsedMs / 60000)),
        remaining: Math.max(0, Math.ceil(remainingMs / 60000)),
        remainingMs,
    };
}

function buildTeamPhaseEmbed(language, isBreak, pomPrefix, duration, elapsed, remaining, memberCount) {
    return new EmbedBuilder()
        .setColor(isBreak ? Colors.INFO : Colors.STUDY)
        .setTitle(`${isBreak ? '☕' : '📚'} ${t(language, 'teamInProgressTitle')}`)
        .setDescription(buildProgressDescription(language, pomPrefix, duration, elapsed, remaining, memberCount))
        .setTimestamp();
}

function buildTeamProgressEmbed(session, memberCount, language = 'en') {
    const pomData = session.pomodoro_data ? JSON.parse(session.pomodoro_data) : null;
    const isBreak = pomData?.type === 'break';
    const pomPrefix = formatPomodoroPrefix(language, pomData);
    const timing = getEffectiveTeamTiming(session);
    const paused = Number(session.paused || 0) === 1;
    const pauseLine = paused
        ? `\n**${t(language, 'pausedLabel')}:** ${t(language, 'pausedStatusLine')}\n`
        : '';

    return new EmbedBuilder()
        .setColor(paused ? Colors.WARNING : (isBreak ? Colors.INFO : Colors.STUDY))
        .setTitle(paused
            ? t(language, 'teamPausedTitle', { title: t(language, 'teamInProgressTitle') })
            : t(language, 'teamInProgressTitle'))
        .setDescription(
            buildProgressDescription(
                language,
                pomPrefix,
                session.duration,
                timing.elapsed,
                timing.remaining,
                memberCount,
            ) + pauseLine
        )
        .setTimestamp();
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('team')
        .setDescription('Host a team study session')
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Session duration in minutes (5-120)')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(120))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum participants (2-20)')
                .setRequired(false)
                .setMinValue(2)
                .setMaxValue(20))
        .addIntegerOption(option =>
            option.setName('break')
                .setDescription('Break duration in minutes (1-30)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(30))
        .addIntegerOption(option =>
            option.setName('cycles')
                .setDescription('Number of complete cycles (default: 4, max: 12)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(12))
        .addBooleanOption(option =>
            option.setName('sound')
                .setDescription('Play a sound in your voice channel when work or a break ends')
                .setRequired(false)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const minutes = interaction.options.getInteger('minutes');
        const limit = interaction.options.getInteger('limit') || 10;
        const breakMin = interaction.options.getInteger('break');
        const cycles = interaction.options.getInteger('cycles') || 4;
        const sound = interaction.options.getBoolean('sound') === true;
        const hostId = interaction.user.id;

        // A team session belongs to a server channel; Discord still offers /team in the bot's DMs
        if (!interaction.guildId || interaction.guild === null) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'serverOnlyTitle'), t(language, 'serverOnlyBody'))],
                flags: 64,
            });
        }

        // ── Hard limits to prevent AFK farming ──────────────────────────
        const MAX_MIN        = 400;
        const MAX_WORK_MIN   = 120;
        const MAX_CYCLES     = 12;

        // Plain study mode: cap at 100 min
        if (!breakMin && minutes > MAX_MIN) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'sessionTooLongTitle'), t(language, 'teamMaxSessionBody', { minutes: MAX_MIN }))],
                flags: 64,
            });
        }

        // Pomodoro mode: work ≤ 25, cycles ≤ 4, total ≤ 100
        if (breakMin) {
            if (minutes > MAX_WORK_MIN) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'limitExceededTitle'), t(language, 'teamMaxWorkBody', { minutes: MAX_WORK_MIN }))],
                    flags: 64,
                });
            }
            if (cycles > MAX_CYCLES) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'limitExceededTitle'), t(language, 'teamMaxCyclesBody', { cycles: MAX_CYCLES }))],
                    flags: 64,
                });
            }
            const totalWorkMin = minutes * cycles;
            if (totalWorkMin > MAX_MIN) {
                return interaction.reply({
                    embeds: [errorEmbed(
                        t(language, 'sessionTooLongTitle'),
                        t(language, 'teamTotalTooLongBody', { minutes, cycles, total: totalWorkMin, max: MAX_MIN })
                    )],
                    flags: 64,
                });
            }
        }
        // ────────────────────────────────────────────────────────────────

        getOrCreateUser(hostId);

        // Check if user already has an active study session or another team session
        if (isUserInAnyActiveSession(hostId)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'activeSessionBody'))],
                flags: 64,
            });
        }

        // Create team session in DB
        const result = db.prepare(
            `INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status, sound_alert)
             VALUES (?, ?, ?, ?, datetime('now'), 'waiting', ?)`
        ).run(interaction.guildId, interaction.channelId, hostId, minutes, sound ? 1 : 0);

        const sessionId = result.lastInsertRowid;

        // Add host as first member
        db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, hostId);

        const members = [hostId];
        activeTeamSessions.set(sessionId, { members, limit, minutes, autoLaunch: true, language });

        if (breakMin) {
            updateTeamSessionPomodoroData(sessionId, {
                cycle: 1,
                maxCycles: cycles,
                work: minutes,
                break: breakMin,
                type: 'work'
            });
        }

        const embed = buildLocalizedLobbyEmbed(sessionId, interaction.user.username, members, limit, minutes, true, language);
        const row = buildLocalizedLobbyButtons(sessionId, true, language);

        const reply = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

        // Store message ID for updates — reply.resource.message.id is the real message ID
        const lobbyMsgId = reply?.resource?.message?.id;
        if (lobbyMsgId) {
            db.prepare('UPDATE team_sessions SET message_id = ? WHERE id = ?').run(lobbyMsgId, sessionId);
        }

        // Auto-timeout: cancel or auto-launch after 5 minutes if not started
        setTimeout(async () => {
            const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
            if (session && session.status === 'waiting') {
                const teamData = activeTeamSessions.get(sessionId);
                if (teamData && teamData.autoLaunch) {
                    // Auto-launch via mock interaction
                    const mockInteraction = {
                        user: { id: session.host_id },
                        client: interaction.client,
                        update: async (opts) => {
                            try {
                                const channel = await interaction.client.channels.fetch(session.channel_id);
                                const msg = await channel.messages.fetch(session.message_id);
                                await msg.edit(opts);
                            } catch(e) {}
                        }
                    };
                    await handleTeamStart(mockInteraction, sessionId);
                } else {
                    db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
                    activeTeamSessions.delete(sessionId);

                    const timeoutEmbed = buildTimeoutEmbed(getTeamLanguage(session, language));

                    try {
                        const channel = await interaction.client.channels.fetch(session.channel_id);
                        const msg = await channel.messages.fetch(session.message_id);
                        await msg.edit({ embeds: [timeoutEmbed], components: [] });
                    } catch (e) { }
                }
            }
        }, 5 * 60 * 1000);
    },
};

/**
 * Handle team join button.
 */
async function handleTeamJoin(interaction, sessionId) {
    const userId = interaction.user.id;
    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!session || (session.status !== 'waiting' && session.status !== 'active')) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamInvalidTitle'), t(language, 'teamInactiveLobbyBody'))], flags: 64 });
    }

    const teamData = activeTeamSessions.get(sessionId);
    if (!teamData) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamDataMissingTitle'), t(language, 'teamDataMissingBody'))], flags: 64 });
    }

    if (teamData.members.includes(userId)) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamAlreadyJoinedTitle'), t(language, 'teamAlreadyJoinedBody'))], flags: 64 });
    }

    if (teamData.members.length >= teamData.limit) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamFullTitle'), t(language, 'teamFullBody'))], flags: 64 });
    }

    // Check if user has an active solo session or is in another team
    if (isUserInAnyActiveSession(userId)) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'teamActiveSessionBody'))], flags: 64 });
    }

    getOrCreateUser(userId);
    teamData.members.push(userId);
    db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);

    if (session.status === 'active') {
        const embed = successEmbed(
            t(language, 'teamJoinedTitle') || 'Joined Team Session',
            t(language, 'teamJoinedActiveBody') || `You have joined the active team session! You'll earn rewards for the time spent studying.`
        );
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const host = await interaction.client.users.fetch(session.host_id).catch(() => null);
    const embed = buildLocalizedLobbyEmbed(sessionId, host?.username || t(language, 'premiumUnknown'), teamData.members, teamData.limit, teamData.minutes, teamData.autoLaunch, language);

    await interaction.update({ embeds: [embed], components: [buildLocalizedLobbyButtons(sessionId, teamData.autoLaunch, language)] });
}

/**
 * Handle team start button (host only).
 */
async function handleTeamStart(interaction, sessionId) {
    const userId = interaction.user.id;
    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!session || session.status !== 'waiting') {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamInvalidTitle'), t(language, 'teamInactiveLobbyBody'))], flags: 64 });
    }

    if (session.host_id !== userId) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamHostOnlyTitle'), t(language, 'teamStartHostOnlyBody'))], flags: 64 });
    }

    const teamData = activeTeamSessions.get(sessionId);
    if (!teamData) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamDataMissingTitle'), t(language, 'teamDataMissingBody'))], flags: 64 });
    }

    // Start the session — store ends_at in SQLite UTC format (no T/Z) to match started_at
    const endsAtDate = new Date(Date.now() + teamData.minutes * 60 * 1000);
    const endsAt = endsAtDate.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    db.prepare("UPDATE team_sessions SET status = 'active', ends_at = ?, started_at = datetime('now'), paused = 0, paused_at = NULL WHERE id = ?")
        .run(endsAt, sessionId);
    const activeSession = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);

    const memberMentions = teamData.members.map(id => `<@${id}>`).join(', ');

    const pomDataStr = session.pomodoro_data;
    let pomPrefix = '';
    let isBreak = false;
    if (pomDataStr) {
        const p = JSON.parse(pomDataStr);
        pomPrefix = formatPomodoroPrefix(language, p);
        isBreak = p.type === 'break';
    }

    const startEmbed = buildTeamStartedEmbed(
        language,
        isBreak,
        pomPrefix,
        teamData.minutes,
        teamData.members.length,
        memberMentions,
    );

    try {
        const response = await interaction.update({
            embeds: [startEmbed],
            components: [buildTeamControlRow(activeSession, language)],
            withResponse: true,
        });

        // Save the message_id so the interval can fetch and edit it later
        const msgId = response?.resource?.message?.id || response?.id;
        if (msgId) {
            db.prepare('UPDATE team_sessions SET message_id = ? WHERE id = ?').run(msgId, sessionId);
        }

        // Start interval and completion timers
        startTeamTimer(interaction.client, sessionId, teamData.minutes * 60 * 1000);
    } catch (err) {
        console.error('[TEAM] Failed to edit lobby message to start session!', err.message);
        db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
        activeTeamSessions.delete(sessionId);
    }
}

/**
 * Manage timers and execution of active team sessions.
 */
function startTeamTimer(client, sessionId, remainingMs) {
    const teamData = activeTeamSessions.get(sessionId);
    if (!teamData) return;

    const currentSession = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    if (currentSession && Number(currentSession.paused || 0) === 1) {
        schedulePausedTeamCancel(client, currentSession);
        return;
    }

    if (remainingMs <= 0) {
        handleTeamComplete(client, sessionId);
        return;
    }

    // Manage multiple timers
    clearTeamTimers(sessionId);
    const timers = {};

    // ─── 5-minute DM reminder for all participants ──────────
    const reminderMs = remainingMs - 5 * 60 * 1000;
    if (reminderMs > 0) {
        timers.reminder = setTimeout(async () => {
            try {
                const s = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
                if (!s || s.status !== 'active' || Number(s.paused || 0) === 1) return; // Session may have ended/cancelled/paused

                const td = activeTeamSessions.get(sessionId);
                if (!td) return;
                const reminderLanguage = getTeamLanguage(s, td.language || 'en');

                for (const memberId of td.members) {
                    try {
                        const settings = getOrCreateSettings(memberId);
                        if (!settings.reminders_enabled) continue;

                        const reminderEmbed = new EmbedBuilder()
                            .setColor(Colors.WARNING)
                            .setTitle(`⏰ ${t(reminderLanguage, 'teamAlmostOverTitle')}`)
                            .setDescription(t(reminderLanguage, 'teamAlmostOverBody'))
                            .setTimestamp();

                        if (settings.notify_type === 'mention') {
                            // Send to the session channel as a ping
                            try {
                                const channel = await client.channels.fetch(s.channel_id);
                                await channel.send({ content: `<@${memberId}>`, embeds: [reminderEmbed] });
                            } catch (_) {}
                        } else {
                            // Default: DM the user
                            const user = await client.users.fetch(memberId).catch(() => null);
                            if (user) {
                                await user.send({ embeds: [reminderEmbed] }).catch(() => {
                                    // User may have DMs disabled — silently ignore
                                });
                            }
                        }
                    } catch (e) {
                        // Per-user errors should never abort other reminders
                    }
                }
            } catch (err) {
                console.error('[TEAM] 5-min reminder error:', err.message);
            }
        }, reminderMs);
    }

    timers.completion = setTimeout(async () => {
        await handleTeamComplete(client, sessionId);
    }, remainingMs);

    timers.interval = setInterval(async () => {
        const s = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
        if (!s || s.status !== 'active') {
            clearTeamTimers(sessionId);
            return;
        }
        if (Number(s.paused || 0) === 1) {
            clearTeamTimers(sessionId);
            schedulePausedTeamCancel(client, s);
            return;
        }

        const now = Date.now();
        const endMs = parseUTC(s.ends_at).getTime();
        const startMs = parseUTC(s.started_at).getTime();
        let elapsed = Math.floor((now - startMs) / 1000 / 60);
        const remaining = Math.max(0, Math.ceil((endMs - now) / 1000 / 60));

        if (remaining === 0) elapsed = teamData.minutes; // Force 100%

        const language = getTeamLanguage(s, teamData.language || 'en');
        const pomDataStr = s.pomodoro_data;
        let pomPrefix = '';
        let isBreak = false;
        if (pomDataStr) {
            const p = JSON.parse(pomDataStr);
            pomPrefix = formatPomodoroPrefix(language, p);
            isBreak = p.type === 'break';
        }

        const updateEmbed = buildTeamPhaseEmbed(
            language,
            isBreak,
            pomPrefix,
            teamData.minutes,
            elapsed,
            remaining,
            teamData.members.length,
        );

        try {
            const channel = await client.channels.fetch(s.channel_id);
            const msg = await channel.messages.fetch(s.message_id);
            await msg.edit({ embeds: [updateEmbed], components: [buildTeamControlRow(s, language)] });
        } catch (e) { }
    }, 60 * 1000);

    activeTeamTimers.set(sessionId, timers);
}

/**
 * Handle team session completion — award all members.
 */
async function handleTeamComplete(client, sessionId) {
    clearTeamTimers(sessionId);

    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    if (!session || session.status !== 'active') return;

    db.prepare("UPDATE team_sessions SET status = 'completed' WHERE id = ?").run(sessionId);

    const members = db.prepare('SELECT * FROM team_members WHERE session_id = ?').all(sessionId);
    // /team sound: ring in the voice channel the host (or a member) is in, at the end of every phase
    if (session.sound_alert) {
        require('../utils/phaseChime').ringPhaseChime(client, session.guild_id, [session.host_id, ...members.map(m => m.user_id)]);
    }
    const teamData = activeTeamSessions.get(sessionId);
    const language = getTeamLanguage(session, teamData?.language || 'en');
    const minutes = session.duration;

    const pomDataStr = session.pomodoro_data;
    let pomData = pomDataStr ? JSON.parse(pomDataStr) : null;
    const isBreak = pomData && pomData.type === 'break';

    const results = [];
    const { getUserClan, addClanXP, getActivePet: _getActivePet } = require('../utils/database');
    const { checkStudyAchievements: _checkStudyAch, checkTeamAchievements: _checkTeamAch } = require('../utils/achievementChecker');

    // First pass to calculate clan synergies
    const clanCounts = {};
    const memberClans = {};

    if (!isBreak) {
        for (const member of members) {
            const c = getUserClan(member.user_id);
            if (c) {
                memberClans[member.user_id] = c;
                clanCounts[c.id] = (clanCounts[c.id] || 0) + 1;
            }
        }
    }

    // Minutes each member was actually present (late joiners get less)
    const memberMinutesById = new Map();

    const teamChallengeNews = [];
    if (!isBreak) {
        const getActivePet = _getActivePet;

        for (const member of members) {
            try {
                let memberMinutes = minutes;
                if (member.joined_at && session.started_at) {
                    const joinedTime = parseUTC(member.joined_at).getTime();
                    const startTime = parseUTC(session.started_at).getTime();
                    if (joinedTime > startTime + 60000) {
                        const activeMs = Date.now() - joinedTime;
                        memberMinutes = Math.min(minutes, Math.max(1, Math.floor(activeMs / 60000)));
                    }
                }

                memberMinutesById.set(member.user_id, memberMinutes);
                const baseWater = waterForMinutes(memberMinutes);
                const baseXP = xpForMinutes(memberMinutes);

                const user = getOrCreateUser(member.user_id);
                let userWater = baseWater;
                let userXP = baseXP;

                // 2x water: boost item first, otherwise Pro (same rule as solo)
                userWater = applyWaterDoubler(member.user_id, userWater).water;

                // Pet bonus — Pets is from constants.js (top-level require)
                const activePet = getActivePet(member.user_id);
                if (activePet && Pets) {
                    const pInfo = Pets[activePet.pet_key];
                    if (pInfo) {
                        const multiplier = petBuffMultiplier(activePet);
                        if (pInfo.buffType === 'xp_boost') {
                            userXP += Math.floor(baseXP * multiplier);
                        } else if (pInfo.buffType === 'water_boost') {
                            userWater += Math.max(1, Math.floor(baseWater * multiplier));
                        }
                    }
                }

                incrementUser(member.user_id, 'water', userWater);
                incrementUser(member.user_id, 'xp', userXP);
                incrementUser(member.user_id, 'total_focus_minutes', memberMinutes);
                incrementUser(member.user_id, 'total_sessions', 1);

                await addGoalProgress(client, {
                    guildId: session.guild_id,
                    userId: member.user_id,
                    minutes: memberMinutes,
                    sourceType: 'team',
                    sourceId: session.id,
                });

                let clanSynergyMsg = '';
                if (memberClans[member.user_id]) {
                    const clan = memberClans[member.user_id];
                    const count = clanCounts[clan.id];
                    const synergyMultiplier = count > 1 ? Math.min(1.0, (count - 1) * 0.2) : 0;
                    const baseClanXP = memberMinutes + userXP;
                    const bonusXP = Math.floor(baseClanXP * synergyMultiplier);
                    addClanXP(clan.id, memberMinutes, userXP + bonusXP);
                    try {
                        require('../utils/clanExpeditions').addFocusMinutesToExpedition(member.user_id, clan.id, memberMinutes);
                    } catch (err) { console.error('[TEAM] Expedition progress failed:', err.message); }
                    if (bonusXP > 0) clanSynergyMsg = ` | 🛡️ Synergy: +${bonusXP} XP`;
                }

                const { streak: newStreak } = applyStudyStreak(member.user_id, user, activePet);
                recordSessionActivity(member.user_id);

                const updated = getOrCreateUser(member.user_id);
                let newLevel = updated.level;
                while (updated.xp >= xpForLevel(newLevel)) newLevel++;
                const leveledUp = newLevel > updated.level;
                if (leveledUp) updateUser(member.user_id, { level: newLevel });

                recordActivityReward(member.user_id, {
                    sourceType: 'team',
                    sourceId: session.id,
                    title: 'Team Study',
                    minutes: memberMinutes,
                    water: userWater,
                    xp: userXP,
                    streak: newStreak,
                    level: newLevel,
                    leveledUp,
                });

                // Update challenge progress for team members
                try {
                    teamChallengeNews.push(...require('../utils/challenges').recordChallengeFocus({ userId: member.user_id, guildId: session.guild_id, minutes: memberMinutes }));
                } catch (err) { console.error('[TEAM] Challenge progress failed:', err.message); }

                const petResult = awardPetXP(member.user_id, userXP);
                let petMsg = '';
                const gainsMsg = ` (+${userWater}💧, +${userXP}XP)`;
                if (petResult && Pets) {
                    const pInfo = Pets[petResult.pet.pet_key];
                    if (pInfo) {
                        petMsg = ` | 🐾 ${pInfo.emoji} +${userXP} XP`;
                        if (petResult.leveledUp) petMsg += ` (${t(language, 'teamPetLevelUp')})`;
                    }
                }

                results.push(`<@${member.user_id}>${gainsMsg}${petMsg}${clanSynergyMsg}`);
            } catch (memberErr) {
                console.error(`[TEAM] Reward error for user ${member.user_id}:`, memberErr.message);
                results.push(`<@${member.user_id}> ⚠️ (${t(language, 'rewardErrorContactAdmin')})`);
            }
        }
    } else {
        for (const member of members) {
            results.push(`<@${member.user_id}>`);
        }
    }

    const embed = new EmbedBuilder();
    let description = '';

    if (!isBreak) {
        const waterAwarded = waterForMinutes(minutes);
        const xpAwarded = xpForMinutes(minutes);
        embed.setColor(Colors.SUCCESS).setTitle(`🎉 ${t(language, 'teamCompleteTitle')}`);
        description =
            `**${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
            `**${t(language, 'teamParticipants')}:** ${members.length}\n\n` +
            `${results.join('\n')}\n\n`;

        const allNewAchievements = [];
        for (const member of members) {
            try {
                const sessionStartHour = parseUTC(session.started_at).getHours();
                const studyAch = _checkStudyAch(member.user_id, memberMinutesById.get(member.user_id) ?? minutes, sessionStartHour);
                const teamAch = _checkTeamAch(member.user_id);
                for (const a of [...studyAch, ...teamAch]) {
                    allNewAchievements.push(`<@${member.user_id}> 🏆 ${a.emoji} **${a.name}**`);
                }
            } catch (achErr) {
                console.error(`[TEAM] Achievement check error for ${member.user_id}:`, achErr.message);
            }
        }

        if (allNewAchievements.length > 0) {
            description += `**${t(language, 'teamAchievementsUnlocked')}:**\n${allNewAchievements.join('\n')}\n\n`;
        }
        description += t(language, 'teamGreatWork');
    } else {
        embed.setColor(Colors.SUCCESS).setTitle(`☕ ${t(language, 'teamBreakOverTitle')}`);
        description =
            `**${t(language, 'teamBreakDuration')}:** ${formatTime(minutes)}\n` +
            `**${t(language, 'teamParticipants')}:** ${members.length}\n\n` +
            `${t(language, 'teamBackToWork')}\n\n` +
            `${results.join(', ')}`;
    }

    embed.setDescription(description).setTimestamp();

    const willTransition = pomData && ( (!isBreak && pomData.cycle < pomData.maxCycles) || (isBreak && pomData.cycle < pomData.maxCycles) );

    try {
        const channel = await client.channels.fetch(session.channel_id);
        await channel.send({ content: results.join(' '), embeds: [embed] });
        if (teamChallengeNews.length) {
            const mentioned = members.map(m => m.user_id);
            await channel.send({ content: [...new Set(teamChallengeNews)].join('\n'), allowedMentions: { users: mentioned } }).catch(() => {});
        }

        if (session.message_id && !willTransition) {
            const msg = await channel.messages.fetch(session.message_id).catch(() => null);
            if (msg) {
                const doneEmbed = new EmbedBuilder()
                    .setColor(Colors.SUCCESS)
                    .setTitle(`✅ ${t(language, 'teamDoneTitle')}`)
                    .setDescription(`${progressBar(1, 1, 20)}\n\n${t(language, 'teamFinishedBody')}`)
                    .setTimestamp();
                await msg.edit({ embeds: [doneEmbed], components: [] });
            }
        }
        if (!isBreak) {
            const { checkAndNotifyQuests } = require('./quests');
            for (const member of members) {
                await checkAndNotifyQuests(client, member.user_id, language, channel);
            }
        }
    } catch (e) {
        console.error('[TEAM] Complete notification error:', e.message);
    }

    if (pomData) {
        if (isBreak) {
            if (pomData.cycle < pomData.maxCycles) {
                pomData.cycle += 1;
                pomData.type = 'work';
                const newDuration = pomData.work;
                db.prepare("UPDATE team_sessions SET status = 'active', duration = ?, ends_at = datetime('now', '+' || ? || ' minutes'), started_at = datetime('now'), paused = 0, paused_at = NULL WHERE id = ?").run(newDuration, newDuration, sessionId);
                updateTeamSessionPomodoroData(sessionId, pomData);
                teamData.minutes = newDuration;

                try {
                    const channel = await client.channels.fetch(session.channel_id);
                    await channel.send(`🍅 ${results.join(' ')} ${t(language, 'sessionBonusPomodoroBreakOver', { cycle: pomData.cycle, maxCycles: pomData.maxCycles, minutes: newDuration })} 💪`);
                    
                    if (session.message_id) {
                        const msg = await channel.messages.fetch(session.message_id).catch(() => null);
                        if (msg) {
                            const newEmbed = new EmbedBuilder()
                                .setColor(Colors.STUDY)
                                .setTitle(`📚 Team Study Session — In Progress`)
                                .setDescription(`**[Cycle ${pomData.cycle}/${pomData.maxCycles} Work]**\n**Duration:** ${formatTime(newDuration)}\n**Elapsed:** 0m | **Remaining:** ${formatTime(newDuration)}\n**Members:** ${members.length}\n\n${progressBar(0, newDuration, 20)}`);
                            const updatedSession = getTeamSessionById(sessionId);
                            await msg.edit({ embeds: [newEmbed], components: [buildTeamControlRow(updatedSession, getTeamLanguage(updatedSession))] });
                        }
                    }
                } catch(e) {}
                startTeamTimer(client, sessionId, newDuration * 60000);
                return;
            }
        } else {
            if (pomData.cycle < pomData.maxCycles) {
                pomData.type = 'break';
                const newDuration = pomData.break;
                db.prepare("UPDATE team_sessions SET status = 'active', duration = ?, ends_at = datetime('now', '+' || ? || ' minutes'), started_at = datetime('now'), paused = 0, paused_at = NULL WHERE id = ?").run(newDuration, newDuration, sessionId);
                updateTeamSessionPomodoroData(sessionId, pomData);
                teamData.minutes = newDuration;

                try {
                    const channel = await client.channels.fetch(session.channel_id);
                    await channel.send(`☕ ${results.join(' ')} ${t(language, 'sessionBonusPomodoroWorkComplete', { cycle: pomData.cycle, maxCycles: pomData.maxCycles, minutes: newDuration })}`);
                    
                    if (session.message_id) {
                        const msg = await channel.messages.fetch(session.message_id).catch(() => null);
                        if (msg) {
                            const newEmbed = new EmbedBuilder()
                                .setColor(Colors.INFO)
                                .setTitle(`☕ Team Study Session — In Progress`)
                                .setDescription(`**[Cycle ${pomData.cycle}/${pomData.maxCycles} Break]**\n**Duration:** ${formatTime(newDuration)}\n**Elapsed:** 0m | **Remaining:** ${formatTime(newDuration)}\n**Members:** ${members.length}\n\n${progressBar(0, newDuration, 20)}`);
                            const updatedSession = getTeamSessionById(sessionId);
                            await msg.edit({ embeds: [newEmbed], components: [buildTeamControlRow(updatedSession, getTeamLanguage(updatedSession))] });
                        }
                    }
                } catch(e) {}
                startTeamTimer(client, sessionId, newDuration * 60000);
                return;
            } else {
                try {
                    const channel = await client.channels.fetch(session.channel_id);
                    await channel.send(`🎉 ${results.join(' ')} ${t(language, 'teamPomodoroCompleteMessage', { cycles: pomData.maxCycles })}`);
                } catch(e) {}
            }
        }
    }

    activeTeamSessions.delete(sessionId);
}

function getTeamSessionById(sessionId) {
    return db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
}

async function updateTeamMessage(client, session, mode = 'active') {
    const teamData = activeTeamSessions.get(session.id);
    if (!teamData || !session.message_id) return;

    const language = getTeamLanguage(session, teamData.language || 'en');
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (!channel) return;

    const message = await channel.messages.fetch(session.message_id).catch(() => null);
    if (!message) return;

    const embed = buildTeamProgressEmbed(session, teamData.members.length, language);
    if (mode === 'paused') {
        embed.addFields({
            name: t(language, 'pauseLimitField'),
            value: t(language, 'pauseLimitBody', { minutes: Math.floor(MAX_TEAM_PAUSE_MS / 60000) }),
            inline: false,
        });
    }

    await message.edit({
        embeds: [embed],
        components: [buildTeamControlRow(session, language)],
    }).catch(() => {});
}

function canPauseTeamSession(session, userId) {
    if (!session || session.status !== 'active') return { ok: false, reason: 'not_found' };
    if (session.host_id !== userId) return { ok: false, reason: 'host_only' };
    if (Number(session.paused || 0) === 1) return { ok: false, reason: 'already_paused' };
    if (Number(session.pause_count || 0) >= MAX_TEAM_PAUSE_COUNT) return { ok: false, reason: 'limit' };
    return { ok: true };
}

async function handleTeamPause(interaction, sessionId) {
    const session = getTeamSessionById(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);
    const validation = canPauseTeamSession(session, interaction.user.id);

    if (!validation.ok) {
        if (validation.reason === 'host_only') {
            return interaction.reply({ embeds: [errorEmbed(t(language, 'teamHostOnlyTitle'), t(language, 'teamPauseHostOnlyBody'))], flags: 64 });
        }
        const bodyKey = validation.reason === 'limit' ? 'pauseLimitReachedBody'
            : validation.reason === 'already_paused' ? 'alreadyPausedBody'
            : 'teamSessionNotFoundBody';
        return interaction.reply({ embeds: [errorEmbed(t(language, 'sessionPauseErrorTitle'), t(language, bodyKey))], flags: 64 });
    }

    clearTeamTimers(sessionId);
    db.prepare(`
        UPDATE team_sessions
        SET paused = 1,
            paused_at = ?,
            pause_count = COALESCE(pause_count, 0) + 1
        WHERE id = ? AND status = 'active'
    `).run(toSqliteDateTime(new Date()), sessionId);

    const updated = getTeamSessionById(sessionId);
    schedulePausedTeamCancel(interaction.client, updated);
    await interaction.update({
        embeds: [buildTeamProgressEmbed(updated, activeTeamSessions.get(sessionId)?.members.length || 0, language)],
        components: [buildTeamControlRow(updated, language)],
    });
    await updateTeamMessage(interaction.client, updated, 'paused');
}

async function handleTeamResume(interaction, sessionId) {
    const session = getTeamSessionById(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!session || session.status !== 'active') {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamInvalidTitle'), t(language, 'teamSessionNotFoundBody'))], flags: 64 });
    }
    if (session.host_id !== interaction.user.id) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamHostOnlyTitle'), t(language, 'teamPauseHostOnlyBody'))], flags: 64 });
    }
    if (Number(session.paused || 0) !== 1 || !session.paused_at) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'sessionPauseErrorTitle'), t(language, 'notPausedBody'))], flags: 64 });
    }

    const pausedAt = parseUTC(session.paused_at);
    const now = new Date();
    const pausedSeconds = Math.max(0, Math.floor((now.getTime() - pausedAt.getTime()) / 1000));
    if (pausedSeconds * 1000 > MAX_TEAM_PAUSE_MS) {
        await cancelPausedTeamSession(interaction.client, session, true);
        return interaction.reply({ embeds: [errorEmbed(t(language, 'sessionAutoCancelledTitle'), t(language, 'pauseTimeoutCancelledBody'))], flags: 64 });
    }

    clearTeamTimers(sessionId);
    const shiftedStart = new Date(parseUTC(session.started_at).getTime() + pausedSeconds * 1000);
    const shiftedEnd = new Date(parseUTC(session.ends_at).getTime() + pausedSeconds * 1000);
    db.prepare(`
        UPDATE team_sessions
        SET paused = 0,
            paused_at = NULL,
            paused_total_seconds = COALESCE(paused_total_seconds, 0) + ?,
            started_at = ?,
            ends_at = ?
        WHERE id = ? AND status = 'active'
    `).run(pausedSeconds, toSqliteDateTime(shiftedStart), toSqliteDateTime(shiftedEnd), sessionId);

    const updated = getTeamSessionById(sessionId);
    await interaction.update({
        embeds: [buildTeamProgressEmbed(updated, activeTeamSessions.get(sessionId)?.members.length || 0, language)],
        components: [buildTeamControlRow(updated, language)],
    });
    startTeamTimer(interaction.client, sessionId, getEffectiveTeamTiming(updated).remainingMs);
}

function schedulePausedTeamCancel(client, session) {
    clearTeamTimers(session.id);
    const pausedAtMs = parseUTC(session.paused_at).getTime();
    const remainingPauseMs = Math.max(0, MAX_TEAM_PAUSE_MS - (Date.now() - pausedAtMs));
    const pauseCancel = setTimeout(async () => {
        const current = getTeamSessionById(session.id);
        if (!current || current.status !== 'active' || Number(current.paused || 0) !== 1) return;
        await cancelPausedTeamSession(client, current, true);
    }, remainingPauseMs);
    activeTeamTimers.set(session.id, { pauseCancel });
}

async function cancelPausedTeamSession(client, session, notify = false) {
    clearTeamTimers(session.id);
    db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(session.id);
    activeTeamSessions.delete(session.id);

    const language = getTeamLanguage(session, 'en');
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(t(language, 'sessionAutoCancelledTitle'))
        .setDescription(t(language, 'pauseTimeoutCancelledBody'))
        .setTimestamp();

    if (session.message_id) {
        const message = await channel.messages.fetch(session.message_id).catch(() => null);
        if (message) await message.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    if (notify) {
        await channel.send({
            content: `<@${session.host_id}>`,
            embeds: [embed],
        }).catch(() => {});
    }
}

/**
 * Handle team cancel button (host only).
 */
async function handleTeamCancel(interaction, sessionId) {
    const userId = interaction.user.id;
    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!session) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamInvalidTitle'), t(language, 'teamSessionNotFoundBody'))], flags: 64 });
    }

    if (session.host_id !== userId) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamHostOnlyTitle'), t(language, 'teamCancelHostOnlyBody'))], flags: 64 });
    }

    clearTeamTimers(sessionId);
    db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
    activeTeamSessions.delete(sessionId);

    const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(`✖️ ${t(language, 'teamCancelledTitle')}`)
        .setDescription(t(language, 'teamCancelledBody'))
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
}

/**
 * Handle auto-launch toggle button (host only).
 */
async function handleTeamAutoLaunch(interaction, sessionId) {
    const userId = interaction.user.id;
    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    const language = session ? getTeamLanguage(session, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!session || session.status !== 'waiting') {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamInvalidTitle'), t(language, 'teamInactiveLobbyBody'))], flags: 64 });
    }

    if (session.host_id !== userId) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamHostOnlyTitle'), t(language, 'teamAutoHostOnlyBody'))], flags: 64 });
    }

    const teamData = activeTeamSessions.get(sessionId);
    if (!teamData) {
        return interaction.reply({ embeds: [errorEmbed(t(language, 'teamDataMissingTitle'), t(language, 'teamDataMissingBody'))], flags: 64 });
    }

    teamData.autoLaunch = !teamData.autoLaunch;

    const host = await interaction.client.users.fetch(session.host_id).catch(() => null);
    const embed = buildLocalizedLobbyEmbed(sessionId, host?.username || t(language, 'premiumUnknown'), teamData.members, teamData.limit, teamData.minutes, teamData.autoLaunch, language);

    await interaction.update({ embeds: [embed], components: [buildLocalizedLobbyButtons(sessionId, teamData.autoLaunch, language)] });
}

/**
 * Recover active team sessions on bot restart.
 */
async function recoverTeamSessions(client) {
    const sessions = db.prepare("SELECT * FROM team_sessions WHERE status IN ('waiting', 'active')").all();
    let recovered = 0;

    for (const session of sessions) {
        const startMs = parseUTC(session.started_at).getTime();
        const memberIds = db.prepare('SELECT user_id FROM team_members WHERE session_id = ?').all(session.id).map(r => r.user_id);

        if (session.status === 'waiting') {
            if (Date.now() - startMs > 5 * 60 * 1000) {
                db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(session.id);
            } else {
                activeTeamSessions.set(session.id, { members: memberIds, limit: 10, minutes: session.duration, autoLaunch: false, language: getGuildLanguage(session.guild_id) });
                setTimeout(async () => {
                    const s = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(session.id);
                    if (s && s.status === 'waiting') {
                        db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(session.id);
                        activeTeamSessions.delete(session.id);
                    }
                }, 5 * 60 * 1000 - (Date.now() - startMs));
                recovered++;
            }
        } else if (session.status === 'active') {
            activeTeamSessions.set(session.id, { members: memberIds, limit: 10, minutes: session.duration, language: getTeamLanguage(session) });
            if (Number(session.paused || 0) === 1) {
                const pausedAtMs = parseUTC(session.paused_at).getTime();
                if (Date.now() - pausedAtMs >= MAX_TEAM_PAUSE_MS) {
                    await cancelPausedTeamSession(client, session, true);
                } else {
                    schedulePausedTeamCancel(client, session);
                    recovered++;
                }
            } else {
                const now = Date.now();
                const endMs = parseUTC(session.ends_at).getTime();
                const remainingMs = endMs - now;
                startTeamTimer(client, session.id, remainingMs);
                recovered++;
            }
        }
    }

    if (sessions.length > 0) {
        console.log(`[TEAM] Recovered ${recovered} active team session(s)`);
    }
}

/**
 * Remove a team session from the in-memory map.
 * Called externally (e.g. from cancel.js) to avoid zombie sessions.
 */
function cleanupTeamSession(sessionId) {
    clearTeamTimers(sessionId);
    activeTeamSessions.delete(sessionId);
}

/**
 * Create a team lobby automatically from a scheduled plan.
 * Called from plan.js
 */
async function createLobbyFromPlan(client, plan, signups, channel) {
    const hostId = plan.host_id;
    const language = getGuildLanguage(plan.guild_id);
    getOrCreateUser(hostId);

    // Create team session in DB
    const result = db.prepare(
        `INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status)
         VALUES (?, ?, ?, ?, datetime('now'), 'waiting')`
    ).run(plan.guild_id, plan.channel_id, hostId, plan.duration);

    const sessionId = result.lastInsertRowid;

    // Add host as first member
    db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, hostId);

    const members = [hostId];
    for (const signup of signups) {
        if (signup.user_id !== hostId) {
            db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, signup.user_id);
            members.push(signup.user_id);
        }
    }

    activeTeamSessions.set(sessionId, { members, limit: plan.limit_count, minutes: plan.duration, autoLaunch: true, language });

    if (plan.break_duration) {
        updateTeamSessionPomodoroData(sessionId, {
            cycle: 1,
            maxCycles: plan.cycles,
            work: plan.duration,
            break: plan.break_duration,
            type: 'work'
        });
    }

    const hostUser = await client.users.fetch(hostId).catch(() => null);
    const hostName = hostUser ? hostUser.username : t(language, 'teamHost');

    const embed = buildLocalizedLobbyEmbed(sessionId, hostName, members, plan.limit_count, plan.duration, true, language);
    const row = buildLocalizedLobbyButtons(sessionId, true, language);

    const mentions = members.map(id => `<@${id}>`).join(' ');

    const replyMsg = await channel.send({ content: `🚀 ${t(language, 'teamPlanStartingBody', { title: plan.title })}\n${mentions}`, embeds: [embed], components: [row] });
    db.prepare('UPDATE team_sessions SET message_id = ? WHERE id = ?').run(replyMsg.id, sessionId);

    // Auto-timeout logic
    setTimeout(async () => {
        const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
        if (session && session.status === 'waiting') {
            const teamData = activeTeamSessions.get(sessionId);
            if (teamData && teamData.autoLaunch) {
                // Mock interaction for auto start
                const mockInteraction = {
                    user: { id: hostId },
                    client: client,
                    update: async (opts) => {
                        try {
                            const c = await client.channels.fetch(plan.channel_id);
                            const m = await c.messages.fetch(session.message_id);
                            await m.edit(opts);
                        } catch (e) {}
                    }
                };
                await handleTeamStart(mockInteraction, sessionId);
            } else {
                db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
                activeTeamSessions.delete(sessionId);
                try {
                    const timeoutEmbed = buildTimeoutEmbed(language);
                    const c = await client.channels.fetch(plan.channel_id);
                    const m = await c.messages.fetch(session.message_id);
                    await m.edit({ embeds: [timeoutEmbed], components: [] });
                } catch (e) {}
            }
        }
    }, 5 * 60 * 1000);
}

module.exports.handleTeamJoin = handleTeamJoin;
module.exports.handleTeamStart = handleTeamStart;
module.exports.handleTeamCancel = handleTeamCancel;
module.exports.handleTeamAutoLaunch = handleTeamAutoLaunch;
module.exports.handleTeamPause = handleTeamPause;
module.exports.handleTeamResume = handleTeamResume;
module.exports.recoverTeamSessions = recoverTeamSessions;
module.exports.cleanupTeamSession = cleanupTeamSession;
module.exports.createLobbyFromPlan = createLobbyFromPlan;

// --- WEB ACTIVITY EXPORTS ---
module.exports.createTeamSessionFromWeb = async function(client, userId, guildId, channelId, minutes, limit = 10) {
    const hostId = userId;
    const language = getGuildLanguage(guildId);
    getOrCreateUser(hostId);

    if (isUserInAnyActiveSession(hostId)) {
        return { success: false, error: 'already_in_session' };
    }

    const result = db.prepare(
        `INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status)
         VALUES (?, ?, ?, ?, datetime('now'), 'waiting')`
    ).run(guildId, channelId, hostId, minutes);

    const sessionId = result.lastInsertRowid;
    db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, hostId);

    const members = [hostId];
    activeTeamSessions.set(sessionId, { members, limit, minutes, autoLaunch: true, language });

    let hostName = t(language, 'teamHost');
    try {
        const user = await client.users.fetch(hostId);
        if (user) hostName = user.username;
    } catch(e) {}

    const embed = buildLocalizedLobbyEmbed(sessionId, hostName, members, limit, minutes, true, language);
    const row = buildLocalizedLobbyButtons(sessionId, true, language);

    try {
        const channel = await client.channels.fetch(channelId);
        const reply = await channel.send({ content: t(language, 'teamWebCreatedBody', { user: `<@${hostId}>` }), embeds: [embed], components: [row] });
        db.prepare('UPDATE team_sessions SET message_id = ? WHERE id = ?').run(reply.id, sessionId);
        
        // Auto-cancel logic
        setTimeout(async () => {
            const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
            if (session && session.status === 'waiting') {
                const teamData = activeTeamSessions.get(sessionId);
                if (teamData && teamData.autoLaunch) {
                    const mockInteraction = {
                        user: { id: hostId },
                        client: client,
                        update: async (opts) => {
                            try {
                                const c = await client.channels.fetch(channelId);
                                const m = await c.messages.fetch(reply.id);
                                await m.edit(opts);
                            } catch(e) {}
                        }
                    };
                    await handleTeamStart(mockInteraction, sessionId);
                } else {
                    db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
                    activeTeamSessions.delete(sessionId);
                    const timeoutEmbed = buildTimeoutEmbed(language);
                    try {
                        const c = await client.channels.fetch(channelId);
                        const m = await c.messages.fetch(reply.id);
                        await m.edit({ embeds: [timeoutEmbed], components: [] });
                    } catch (e) {}
                }
            }
        }, 5 * 60 * 1000);

        return { success: true, sessionId };
    } catch(e) {
        try {
            const user = await client.users.fetch(hostId);
            await user.send('❌ I tried to create a Team Session in <#' + channelId + '>, but I do not have permissions to send messages there! Please give me the **Send Messages** permission in that channel.');
        } catch(_) {}
        return { success: false, error: 'send_error' };
    }
};

module.exports.handleTeamJoinFromWeb = async function(client, userId, sessionId, guildId = null) {
    getOrCreateUser(userId);

    const session = db.prepare('SELECT * FROM team_sessions WHERE id = ?').get(sessionId);
    if (!session) return { success: false, error: 'not_found' };
    // Room codes are sequential numbers: only rooms in the user's own server can be joined
    if (guildId && session.guild_id !== guildId) return { success: false, error: 'not_found' };
    if (session.status !== 'waiting') return { success: false, error: 'already_started' };

    if (isUserInAnyActiveSession(userId)) return { success: false, error: 'already_in_session' };

    const teamData = activeTeamSessions.get(parseInt(sessionId));
    if (!teamData) return { success: false, error: 'not_found' };
    const language = teamData.language || getTeamLanguage(session);

    if (teamData.members.includes(userId)) return { success: false, error: 'already_joined' };
    if (teamData.members.length >= teamData.limit) return { success: false, error: 'full' };

    db.prepare('INSERT OR IGNORE INTO team_members (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
    teamData.members.push(userId);

    let hostName = t(language, 'teamHost');
    try {
        const hostUser = await client.users.fetch(session.host_id);
        if (hostUser) hostName = hostUser.username;
    } catch(e) {}

    const embed = buildLocalizedLobbyEmbed(sessionId, hostName, teamData.members, teamData.limit, teamData.minutes, teamData.autoLaunch, language);
    const row = buildLocalizedLobbyButtons(sessionId, teamData.autoLaunch, language);

    try {
        const channel = await client.channels.fetch(session.channel_id);
        const msg = await channel.messages.fetch(session.message_id);
        await msg.edit({ embeds: [embed], components: [row] });
        return { success: true };
    } catch (e) {
        return { success: false, error: 'update_error' };
    }
};
