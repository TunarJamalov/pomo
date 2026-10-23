/**
 * Event: ready
 * Fires once when the bot successfully logs in.
 * Sets bot presence with active focused count or rotating motivational quotes.
 * Recovers active study/break sessions from the database.
 */

const { Events, ActivityType } = require('discord.js');
const { recoverSessions } = require('../utils/timerManager');
const { recoverTeamSessions } = require('../commands/team');
const { recoverPlans } = require('../commands/plan');
const { recoverVoiceSessions } = require('../utils/voiceManager');
const { db, syncGuildInstallations } = require('../utils/database');
const { startTopggStatsPoster } = require('../utils/topggStats');
const { startSetupReminderJob } = require('../utils/setupReminder');
const { startPremiumExpiryJob } = require('../utils/premiumManager');
const { startBotHeartbeat } = require('../utils/streakPolicy');
const { startDailyBankInterest } = require('../utils/dailyBankInterest');

// ─── Motivational Quotes ──────────────────────────────────────────
const QUOTES = [
    '🍅 One Pomodoro at a time.',
    '🔥 Consistency beats motivation.',
    '⏱️ 25 minutes can change your day.',
    '📚 Deep work = deep results.',
    '💧 Study hard. Earn water.',
    '🌱 Small steps, big growth.',
    '⚔️ Build your clan. Rule the board.',
    '🧠 Focus is a superpower.',
    '🎯 Start before you feel ready.',
    '🏆 Champions study on hard days too.',
    '✨ Progress over perfection.',
    '🌍 Somewhere, someone is outworking you.',
    '⚡ Powered by AzeDev — azedev.com/links',
];

let tickIndex = 0;

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ✅ Bot logged in as ${client.user.tag}`);
        console.log(`[${timestamp}] 📡 Serving ${client.guilds.cache.size} guild(s)`);

        syncGuildInstallations(client.guilds.cache.values());
        startBotHeartbeat();
        startTopggStatsPoster(client);
        startSetupReminderJob(client);
        startPremiumExpiryJob(client);
        require('../services/billingProcessor').startBillingProcessor(client);
        require('../utils/assistant').startAssistantJob(client);
        startDailyBankInterest();
        (async () => recoverSessions(client))().catch(err => console.error('[READY] recoverSessions failed:', err));
        (async () => recoverTeamSessions(client))().catch(err => console.error('[READY] recoverTeamSessions failed:', err));
        (async () => recoverPlans(client))().catch(err => console.error('[READY] recoverPlans failed:', err));
        recoverVoiceSessions(client).catch(err => {
            console.error('[VOICE] Recovery failed:', err);
        });

        updatePresence(client);

        // Rotate every 20 seconds
        setInterval(() => updatePresence(client), 20 * 1000);

        // Poll for web activity commands every 3 seconds; skip a tick while the previous one is still running
        let activityPollRunning = false;
        setInterval(async () => {
            if (activityPollRunning) return;
            activityPollRunning = true;
            try {
                await processActivityCommands(client);
            } catch (err) {
                console.error('[ACTIVITY] Poll failed:', err);
            } finally {
                activityPollRunning = false;
            }
        }, 3000);
    },
};

const { getPendingActivityCommands, markActivityCommandProcessed, getOrCreateUser, isUserInAnyActiveSession, createSession, getActiveSessionForUser } = require('../utils/database');
const { startStudyTimer } = require('../utils/timerManager');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('../utils/constants');
const { progressBar, formatTime } = require('../utils/embeds');

async function processActivityCommands(client) {
    const commands = getPendingActivityCommands();
    for (const cmd of commands) {
        try {
            if (cmd.type !== 'stop' && isUserInAnyActiveSession(cmd.user_id)) {
                markActivityCommandProcessed(cmd.id, 'failed_already_in_session');
                continue;
            }
            
            const minutes = cmd.minutes;
            const title = "Focus Session (Web)";
            let channel = null;
            let guildId = null;
            if (cmd.channel_id === 'web-dashboard') {
                guildId = 'web-dashboard';
            } else {
                channel = await client.channels.fetch(cmd.channel_id).catch(() => null);
                guildId = channel ? (channel.guildId ?? channel.guild?.id ?? null) : null;
                if (!channel || !guildId) {
                    // The Activity also runs in servers without Pomo and in DMs, where the bot
                    // can't see the channel. Like /study from a user install, a solo timer then
                    // runs in the user's DMs; Stop needs no channel; team sessions need a server.
                    if (cmd.type === 'create_team' || cmd.type === 'join_team') {
                        markActivityCommandProcessed(cmd.id, 'failed_channel_not_found');
                        continue;
                    }
                    channel = null;
                    guildId = null;
                    if (cmd.type !== 'stop') {
                        channel = await client.users.createDM(cmd.user_id).catch(() => null);
                        if (!channel) {
                            markActivityCommandProcessed(cmd.id, 'failed_dm_closed');
                            continue;
                        }
                    }
                } else {
                    // channel_id comes from the web client: only act on channels the user can actually use
                    const member = await channel.guild.members.fetch(cmd.user_id).catch(() => null);
                    const perms = member ? channel.permissionsFor(member) : null;
                    if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
                        markActivityCommandProcessed(cmd.id, 'failed_no_channel_access');
                        continue;
                    }
                }
            }
            
            if (cmd.type === 'stop') {
                const session = getActiveSessionForUser(cmd.user_id);
                if (session) {
                    const { clearTimers } = require('../utils/timerManager');
                    const { deleteSession } = require('../utils/database');
                    clearTimers(session.id);
                    deleteSession(session.id);
                    // Also try to update message if it had one
                    if (session.channel_id && session.channel_id !== 'web-dashboard' && session.message_id) {
                        const c = await client.channels.fetch(session.channel_id).catch(() => null);
                        if (c) {
                            const m = await c.messages.fetch(session.message_id).catch(() => null);
                            if (m) m.edit({ components: [] }).catch(() => {});
                        }
                    }
                }
                markActivityCommandProcessed(cmd.id, 'processed');
                continue;
            }
            
            if (cmd.type === 'create_team') {
                const teamCmd = client.commands.get('team');
                if (teamCmd && teamCmd.createTeamSessionFromWeb) {
                    const res = await teamCmd.createTeamSessionFromWeb(client, cmd.user_id, guildId, cmd.channel_id, cmd.minutes);
                    if (!res.success) {
                        markActivityCommandProcessed(cmd.id, 'failed_' + res.error);
                        continue;
                    }
                }
            } else if (cmd.type === 'join_team') {
                const teamCmd = client.commands.get('team');
                if (teamCmd && teamCmd.handleTeamJoinFromWeb) {
                    const res = await teamCmd.handleTeamJoinFromWeb(client, cmd.user_id, cmd.extra_data, guildId);
                    if (!res.success) {
                        markActivityCommandProcessed(cmd.id, 'failed_' + res.error);
                        continue;
                    }
                }
            } else {
                // Default 'study' type
                getOrCreateUser(cmd.user_id);
                let linkedTodo = null;
                let subject = 'general';
                if (cmd.extra_data) {
                    try {
                        const parsed = JSON.parse(cmd.extra_data);
                        if (parsed?.todoId) {
                            linkedTodo = db.prepare('SELECT id, content FROM todos WHERE id = ? AND user_id = ? AND completed = 0')
                                .get(parsed.todoId, cmd.user_id);
                        }
                        if (['general', 'math', 'language', 'coding', 'reading', 'exam'].includes(parsed?.subject)) {
                            subject = parsed.subject;
                        }
                    } catch (_) {}
                }
                const sessionTitle = linkedTodo?.content || title;
                
                const embed = new EmbedBuilder()
                    .setColor(Colors.STUDY)
                    .setTitle(`📚 ${title}`)
                    .setDescription(
                        `**Duration:** ${formatTime(minutes)}\n` +
                        `**Elapsed:** 0m\n` +
                        `**Remaining:** ${formatTime(minutes)}\n\n` +
                        `${progressBar(0, minutes, 20)}`
                    )
                    .setFooter({ text: `Started from PomoFocus Web Activity` })
                    .setTimestamp();
                    
                if (linkedTodo) {
                    embed
                        .setTitle(`Focus Session - ${sessionTitle}`)
                        .addFields({ name: 'Linked Task', value: linkedTodo.content.slice(0, 1024), inline: false });
                }
                embed.addFields({ name: 'Subject', value: subject.charAt(0).toUpperCase() + subject.slice(1), inline: true });

                // channel is the DM channel when the bot couldn't see the Activity's channel
                const sessionChannelId = channel ? channel.id : cmd.channel_id;
                const sessionId = createSession(cmd.user_id, guildId, sessionChannelId, null, minutes, sessionTitle, linkedTodo?.id || null, subject);
                
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`cancel_study_${sessionId}`)
                        .setLabel('Cancel Session')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('⏹️')
                );
                
                if (channel) {
                    const reply = await channel.send({ content: `<@${cmd.user_id}> Your web timer has started!`, embeds: [embed], components: [row] }).catch(() => null);
                    if (!reply) {
                        markActivityCommandProcessed(cmd.id, 'failed_send_error');
                        continue;
                    }
                    db.prepare('UPDATE study_sessions SET message_id = ? WHERE id = ?').run(reply.id, sessionId);
                }
                const session = getActiveSessionForUser(cmd.user_id);
                if (session) startStudyTimer(client, session, true);
            }
            
            markActivityCommandProcessed(cmd.id, 'processed');
        } catch (e) {
            console.error('[ACTIVITY] Failed to process command:', e);
            markActivityCommandProcessed(cmd.id, 'failed_error');
        }
    }
}

/**
 * Build the full rotation pool dynamically.
 * The live user count is always one of the slots.
 */
function buildPool(count) {
    const countText = count > 0
        ? `📚 ${count} ${count === 1 ? 'person' : 'people'} focused`
        : '📚 /study to start!';

    // Interleave count with quotes: count appears every 3 ticks
    return [countText, ...QUOTES];
}

/**
 * Update bot presence — always rotating, every 20 seconds.
 */
function updatePresence(client) {
    try {
        const activeSessions = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM (
                SELECT user_id
                FROM study_sessions
                WHERE completed = 0 AND title != '__break__'

                UNION ALL

                SELECT tm.user_id
                FROM team_members tm
                JOIN team_sessions ts ON tm.session_id = ts.id
                WHERE ts.status = 'active'

                UNION ALL

                SELECT user_id
                FROM voice_sessions
                WHERE status = 'active'
            )
        `).get();

        const count = activeSessions?.count || 0;
        const pool  = buildPool(count);
        const text  = pool[tickIndex % pool.length];
        tickIndex++;

        client.user.setPresence({
            activities: [{ name: text, type: ActivityType.Custom }],
            status: 'online',
        });
    } catch (err) {
        console.error('[PRESENCE] Error updating presence:', err.message);
    }
}

module.exports.processActivityCommands = processActivityCommands;
