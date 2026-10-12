const cron = require('node-cron');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('./constants');
const { db, getAllEnabledGuildReports } = require('./database');
const { formatTime, progressBar } = require('./embeds');
const {
    getPreviousWeekWindow,
    getWeekWindow,
    isLocalMondayReportWindow,
    toSqlDateTime,
} = require('./timezone');

function generateWeeklyReportEmbed(guildId, guildName, options = {}) {
    const timeZone = options.timeZone || 'UTC';
    const window = options.window || getPreviousWeekWindow(new Date(), timeZone);
    const data = getWeeklyReportData(guildId, window);
    if (!data) return null;

    return new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`Weekly Study Report - ${guildName || 'This Server'}`)
        .setDescription(
            `This past week, the server studied together for **${formatTime(data.totalMinutes)}** ` +
            `across **${data.totalSessions}** completed sessions.\n` +
            `Active students: **${data.activeStudents}**`
        )
        .addFields(
            {
                name: 'Focus Breakdown',
                value: formatBreakdown(data),
                inline: false,
            },
            {
                name: 'Top Focusers of the Week',
                value: formatLeaderboard(data.topFocusers),
                inline: false,
            },
            {
                name: 'Top Subjects',
                value: formatSubjects(data.subjects),
                inline: true,
            },
            {
                name: 'Top Voice Focus',
                value: formatVoiceLeaders(data.voiceLeaders),
                inline: true,
            },
            {
                name: 'Weekly Goal',
                value: formatGoalText(data.goal, data.goalStats),
                inline: false,
            },
            {
                name: 'Next Week',
                value: data.goal
                    ? 'Next week starts fresh. Use `/goal status` to track the new challenge and `/study` or voice tracking to contribute.'
                    : 'Want a shared target next week? A manager can run `/goal setup` to turn weekly reports into a server challenge.',
                inline: false,
            },
        )
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/1508/1508843.png')
        .setFooter({ text: `${window.startDate} to ${window.endDate} (${window.timeZone})` })
        .setTimestamp();
}

function getWeeklyReportData(guildId, window) {
    const startSql = toSqlDateTime(window.startUtc);
    const endSql = toSqlDateTime(window.endUtc);

    const soloRows = db.prepare(`
        SELECT user_id, SUM(duration) as total_mins
        FROM study_sessions
        WHERE guild_id = ?
          AND completed = 1
          AND title != '__break__'
          AND started_at >= ?
          AND started_at < ?
        GROUP BY user_id
    `).all(guildId, startSql, endSql);

    const soloSummary = db.prepare(`
        SELECT COALESCE(SUM(duration), 0) as minutes,
               COUNT(*) as sessions
        FROM study_sessions
        WHERE guild_id = ?
          AND completed = 1
          AND title != '__break__'
          AND started_at >= ?
          AND started_at < ?
    `).get(guildId, startSql, endSql);

    const teamRows = db.prepare(`
        SELECT tm.user_id, SUM(ts.duration) as total_mins
        FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE ts.guild_id = ?
          AND ts.status = 'completed'
          AND ts.started_at >= ?
          AND ts.started_at < ?
        GROUP BY tm.user_id
    `).all(guildId, startSql, endSql);

    const teamSummary = db.prepare(`
        SELECT COALESCE(SUM(ts.duration), 0) as minutes,
               COUNT(*) as contributions,
               COUNT(DISTINCT ts.id) as sessions
        FROM team_members tm
        JOIN team_sessions ts ON tm.session_id = ts.id
        WHERE ts.guild_id = ?
          AND ts.status = 'completed'
          AND ts.started_at >= ?
          AND ts.started_at < ?
    `).get(guildId, startSql, endSql);

    const voiceRows = db.prepare(`
        SELECT user_id, SUM(credited_minutes) as total_mins
        FROM voice_sessions
        WHERE guild_id = ?
          AND status = 'completed'
          AND credited_minutes > 0
          AND ended_at >= ?
          AND ended_at < ?
        GROUP BY user_id
    `).all(guildId, startSql, endSql);

    const voiceSummary = db.prepare(`
        SELECT COALESCE(SUM(credited_minutes), 0) as minutes,
               COUNT(*) as sessions
        FROM voice_sessions
        WHERE guild_id = ?
          AND status = 'completed'
          AND credited_minutes > 0
          AND ended_at >= ?
          AND ended_at < ?
    `).get(guildId, startSql, endSql);

    const subjects = db.prepare(`
        SELECT COALESCE(NULLIF(subject, ''), 'general') as subject,
               SUM(duration) as total_mins
        FROM study_sessions
        WHERE guild_id = ?
          AND completed = 1
          AND title != '__break__'
          AND started_at >= ?
          AND started_at < ?
        GROUP BY COALESCE(NULLIF(subject, ''), 'general')
        ORDER BY total_mins DESC
        LIMIT 3
    `).all(guildId, startSql, endSql);

    const goal = db.prepare(`
        SELECT *
        FROM guild_goals
        WHERE guild_id = ?
          AND week_start = ?
        ORDER BY id DESC
        LIMIT 1
    `).get(guildId, window.startDate);

    const goalStats = goal
        ? db.prepare(`
            SELECT COALESCE(SUM(minutes), 0) as total_minutes,
                   COUNT(DISTINCT user_id) as contributors
            FROM guild_goal_contributions
            WHERE goal_id = ?
        `).get(goal.id)
        : null;

    const userStats = new Map();
    for (const row of soloRows) {
        userStats.set(row.user_id, (userStats.get(row.user_id) || 0) + Number(row.total_mins || 0));
    }
    for (const row of teamRows) {
        userStats.set(row.user_id, (userStats.get(row.user_id) || 0) + Number(row.total_mins || 0));
    }
    for (const row of voiceRows) {
        userStats.set(row.user_id, (userStats.get(row.user_id) || 0) + Number(row.total_mins || 0));
    }

    if (userStats.size === 0) return null;

    const totalMinutes = Array.from(userStats.values()).reduce((sum, minutes) => sum + minutes, 0);
    const totalSessions = Number(soloSummary.sessions || 0)
        + Number(teamSummary.sessions || 0)
        + Number(voiceSummary.sessions || 0);

    return {
        totalMinutes,
        totalSessions,
        activeStudents: userStats.size,
        breakdown: {
            solo: {
                minutes: Number(soloSummary.minutes || 0),
                sessions: Number(soloSummary.sessions || 0),
            },
            team: {
                minutes: Number(teamSummary.minutes || 0),
                sessions: Number(teamSummary.sessions || 0),
                contributions: Number(teamSummary.contributions || 0),
            },
            voice: {
                minutes: Number(voiceSummary.minutes || 0),
                sessions: Number(voiceSummary.sessions || 0),
            },
        },
        topFocusers: Array.from(userStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([userId, minutes]) => ({ userId, minutes })),
        subjects: subjects.map(row => ({
            subject: row.subject,
            minutes: Number(row.total_mins || 0),
        })),
        voiceLeaders: voiceRows
            .slice()
            .sort((a, b) => Number(b.total_mins || 0) - Number(a.total_mins || 0))
            .slice(0, 3)
            .map(row => ({
                userId: row.user_id,
                minutes: Number(row.total_mins || 0),
            })),
        goal,
        goalStats,
    };
}

function formatBreakdown(data) {
    return [
        `Solo: **${formatTime(data.breakdown.solo.minutes)}** (${data.breakdown.solo.sessions} sessions)`,
        `Team: **${formatTime(data.breakdown.team.minutes)}** (${data.breakdown.team.sessions} rooms, ${data.breakdown.team.contributions} contributions)`,
        `Voice: **${formatTime(data.breakdown.voice.minutes)}** (${data.breakdown.voice.sessions} tracked sessions)`,
    ].join('\n');
}

function formatLeaderboard(rows) {
    if (!rows.length) return 'No completed focus sessions yet.';
    return rows
        .map((row, index) => `${rankPrefix(index)} <@${row.userId}> - **${formatTime(row.minutes)}**`)
        .join('\n');
}

function formatSubjects(rows) {
    if (!rows.length) return 'No subject data yet.';
    const total = rows.reduce((sum, row) => sum + row.minutes, 0);
    return rows
        .map(row => {
            const percent = total > 0 ? Math.round((row.minutes / total) * 100) : 0;
            return `${subjectLabel(row.subject)} - **${formatTime(row.minutes)}** (${percent}%)`;
        })
        .join('\n');
}

function formatVoiceLeaders(rows) {
    if (!rows.length) return 'No voice focus tracked this week.';
    return rows
        .map((row, index) => `${rankPrefix(index)} <@${row.userId}> - **${formatTime(row.minutes)}**`)
        .join('\n');
}

function formatGoalText(goal, goalStats) {
    if (!goal) {
        return 'No weekly server goal was configured for this report window.';
    }

    const total = Number(goalStats?.total_minutes || 0);
    const target = Number(goal.target_minutes || 0);
    const status = goal.status === 'completed' ? 'Completed' : 'In progress';
    // progressBar() already appends the percentage
    return `${progressBar(total, target || 1, 12)}\n` +
        `Status: **${status}** | Progress: **${formatTime(total)} / ${formatTime(target)}** | Contributors: **${goalStats?.contributors || 0}**`;
}

function rankPrefix(index) {
    return index < 3 ? `#${index + 1}` : `**${index + 1}.**`;
}

function subjectLabel(subject) {
    const labels = {
        general: 'General',
        math: 'Math',
        language: 'Language',
        coding: 'Coding',
        reading: 'Reading',
        exam: 'Exam',
    };
    return labels[subject] || 'General';
}

// Discord errors that will not go away by retrying later the same day
const PERMANENT_SEND_ERRORS = new Set([
    10003, // Unknown Channel
    50001, // Missing Access
    50013, // Missing Permissions
]);

function markReportWeek(guildId, weekStart) {
    db.prepare(`
        UPDATE guild_settings
        SET report_last_week_start = ?
        WHERE guild_id = ?
    `).run(weekStart, guildId);
}

function initWeeklyReportJob(client) {
    cron.schedule('*/15 * * * *', async () => {
        console.log('[REPORT] Running weekly server reports job...');

        const enabledGuilds = getAllEnabledGuildReports();
        let sentCount = 0;
        const now = new Date();

        for (const config of enabledGuilds) {
            try {
                const guildId = config.guild_id;
                const channelId = config.report_channel_id;
                const timeZone = config.timezone || 'UTC';
                if (!isLocalMondayReportWindow(now, timeZone)) continue;

                const currentWeek = getWeekWindow(now, timeZone);
                if (config.report_last_week_start === currentWeek.startDate) continue;

                const guild = await client.guilds.fetch(guildId).catch(() => null);
                if (!guild) continue;

                const configured = await guild.channels.fetch(channelId).catch(() => null);
                const me = guild.members.me;
                const canSend = c => c && me && c.permissionsFor(me)?.has([
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                ]);
                // If the report channel was deleted or locked, post in the server's
                // main channel with a note, so admins learn about it instead of
                // reports silently stopping.
                let channel = configured;
                let usedFallback = false;
                if (!canSend(configured)) {
                    const { findWelcomeChannel } = require('../events/guildCreate');
                    channel = findWelcomeChannel(guild);
                    usedFallback = Boolean(channel);
                }
                if (!canSend(channel)) {
                    // Skip this week instead of retrying every 15 minutes all Monday
                    console.warn(`[REPORT] Skipping guild ${guildId}: report channel ${channelId} missing or not writable.`);
                    markReportWeek(guildId, currentWeek.startDate);
                    continue;
                }

                const embed = generateWeeklyReportEmbed(guildId, guild.name, {
                    timeZone,
                    window: getPreviousWeekWindow(now, timeZone),
                });
                if (embed) {
                    await channel.send({
                        content: usedFallback
                            ? "📌 Pomo couldn't post in the weekly report channel (it was deleted or I lost access). Server admins: run `/setup start report_channel:` to pick a new one."
                            : undefined,
                        embeds: [embed],
                    });
                    sentCount++;
                }

                markReportWeek(guildId, currentWeek.startDate);
            } catch (err) {
                if (PERMANENT_SEND_ERRORS.has(err?.code)) {
                    console.warn(`[REPORT] Skipping guild ${config.guild_id} this week: ${err.message}`);
                    try { markReportWeek(config.guild_id, getWeekWindow(now, config.timezone || 'UTC').startDate); } catch (_) {}
                } else {
                    console.error(`[REPORT] Failed to send report to guild ${config.guild_id}:`, err);
                }
            }
        }

        console.log(`[REPORT] Weekly reports job finished. Sent to ${sentCount} servers.`);
    }, { timezone: 'UTC' });
}

module.exports = {
    generateWeeklyReportEmbed,
    getWeeklyReportData,
    initWeeklyReportJob,
};
