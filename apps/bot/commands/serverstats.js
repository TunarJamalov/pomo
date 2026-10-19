const {
    SlashCommandBuilder,
    AttachmentBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const {
    db,
    getOrCreateGuildSettings,
    getOrCreateCurrentGuildGoal,
    getGuildGoalStats,
    getBuddyFunnelStats,
} = require('../utils/database');
const { Colors } = require('../utils/constants');
const { errorEmbed, formatTime } = require('../utils/embeds');
const {
    isSetupComplete,
    buildSetupButtonRow,
    getSetupChecklist,
    formatSetupChecklist,
    formatSetupNextAction,
} = require('../utils/setupWizard');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { generateServerStatsCard } = require('../utils/canvas');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('serverstats')
        .setDescription('View server activity and setup insights')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addBooleanOption(option =>
            option.setName('share')
                .setDescription('Post a public visual progress card for this server')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const share = interaction.options.getBoolean('share') || false;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'missingPermissionTitle'), t(language, 'manageServerRequired'))],
                flags: 64,
            });
        }

        const guildId = interaction.guildId;
        const activity = getServerActivity(guildId);
        const topContributor = getTopContributor(guildId);
        const topCommand = db.prepare(`
            SELECT command_name, subcommand_name, COUNT(*) as uses
            FROM command_usage
            WHERE guild_id = ? AND used_at >= datetime('now', '-7 days')
            GROUP BY command_name, subcommand_name
            ORDER BY uses DESC
            LIMIT 1
        `).get(guildId);
        const commandUses = db.prepare(`
            SELECT COUNT(*) as uses, COUNT(DISTINCT user_id) as users
            FROM command_usage
            WHERE guild_id = ? AND used_at >= datetime('now', '-7 days')
        `).get(guildId);
        const settings = getOrCreateGuildSettings(guildId);
        const checklist = getSetupChecklist(settings);
        const goal = getOrCreateCurrentGuildGoal(guildId);
        const goalStats = goal ? getGuildGoalStats(goal.id) : null;

        const setupItems = [
            `${t(language, 'serverVoice')}: **${settings.voice_tracking_enabled ? t(language, 'on') : t(language, 'off')}**`,
            `${t(language, 'serverReports')}: **${settings.report_enabled ? t(language, 'on') : t(language, 'off')}**`,
            `${t(language, 'serverGoal')}: **${settings.goal_enabled ? t(language, 'on') : t(language, 'off')}**`,
        ];
        const topCommandText = topCommand
            ? `/${topCommand.command_name}${topCommand.subcommand_name ? ` ${topCommand.subcommand_name}` : ''} (${topCommand.uses})`
            : t(language, 'serverNoCommandData');
        const goalText = goal
            ? `${formatTime(goalStats.total_minutes)} / ${formatTime(goal.target_minutes)}`
            : t(language, 'serverDisabled');
        const topContributorText = topContributor
            ? `${topContributor.user_id} - ${formatTime(topContributor.minutes)}`
            : t(language, 'serverNoFocusSessions');

        if (share) {
            await interaction.deferReply();
            const buffer = await generateServerStatsCard({
                guildName: interaction.guild.name,
                activity,
                commandUses,
                topCommandText,
                topContributorText: topContributor
                    ? `${formatTime(topContributor.minutes)} focused`
                    : t(language, 'serverNoFocusSessions'),
                goalText,
                setupScore: checklist.scoreText,
            });
            const attachment = new AttachmentBuilder(buffer, { name: 'server-progress.png' });
            return interaction.editReply({
                content: `**${interaction.guild.name}** study progress with PomoBot`,
                files: [attachment],
            });
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(t(language, 'serverInsightsTitle', { guild: interaction.guild.name }))
            .addFields(
                {
                    name: t(language, 'serverFocus7d'),
                    value: `${formatTime(activity.current_minutes)}\n${formatChange(activity.current_minutes, activity.previous_minutes, language)}`,
                    inline: true,
                },
                {
                    name: t(language, 'serverActiveStudents'),
                    value: `${activity.current_users}\n${formatChange(activity.current_users, activity.previous_users, language)}`,
                    inline: true,
                },
                {
                    name: t(language, 'serverCompletedSessions'),
                    value: `${activity.current_sessions}\n${formatChange(activity.current_sessions, activity.previous_sessions, language)}`,
                    inline: true,
                },
                {
                    name: t(language, 'serverTopContributor'),
                    value: topContributor ? `<@${topContributor.user_id}> - ${formatTime(topContributor.minutes)}` : topContributorText,
                    inline: false,
                },
                {
                    name: t(language, 'serverCommands7d'),
                    value: `${t(language, 'serverCommandUses')}: **${commandUses.uses || 0}** | ${t(language, 'serverCommandUsers')}: **${commandUses.users || 0}**\n${t(language, 'serverCommandTop')}: **${topCommandText}**`,
                    inline: false,
                },
                {
                    name: `${t(language, 'serverSetup')} (${checklist.scoreText})`,
                    value: `${setupItems.join(' | ')}\n\n${formatSetupChecklist(settings)}`,
                    inline: false,
                },
                {
                    name: t(language, 'serverWeeklyGoal'),
                    value: goalText,
                    inline: true,
                },
                {
                    name: '🤝 PomoMatch (7d)',
                    value: formatBuddyFunnelField(guildId),
                    inline: false,
                },
            )
            .setFooter({ text: t(language, 'serverStatsFooter') })
            .setTimestamp();

        const setupComplete = isSetupComplete(settings);
        const components = setupComplete ? [] : [buildSetupButtonRow(null, 'en', interaction.guild)];
        if (!setupComplete) {
            embed.addFields({
                name: t(language, 'serverStatsSetupHintField'),
                value: `${t(language, 'serverStatsSetupHintBody')}\n${formatSetupNextAction(settings)}`,
                inline: false,
            });
        }
        return interaction.reply({ embeds: [embed], components, flags: 64 });
    },
};

function getServerActivity(guildId) {
    return db.prepare(`
        WITH focus AS (
            SELECT user_id, duration as minutes, started_at as occurred_at
            FROM study_sessions
            WHERE guild_id = ? AND completed = 1 AND title != '__break__'

            UNION ALL

            SELECT tm.user_id, ts.duration as minutes, ts.started_at as occurred_at
            FROM team_members tm
            JOIN team_sessions ts ON tm.session_id = ts.id
            WHERE ts.guild_id = ? AND ts.status = 'completed'

            UNION ALL

            SELECT user_id, credited_minutes as minutes, ended_at as occurred_at
            FROM voice_sessions
            WHERE guild_id = ? AND status = 'completed' AND credited_minutes > 0
        )
        SELECT
            COALESCE(SUM(CASE WHEN occurred_at >= datetime('now', '-7 days') THEN minutes ELSE 0 END), 0) as current_minutes,
            COALESCE(SUM(CASE
                WHEN occurred_at >= datetime('now', '-14 days')
                 AND occurred_at < datetime('now', '-7 days')
                THEN minutes ELSE 0 END), 0) as previous_minutes,
            COUNT(DISTINCT CASE WHEN occurred_at >= datetime('now', '-7 days') THEN user_id END) as current_users,
            COUNT(DISTINCT CASE
                WHEN occurred_at >= datetime('now', '-14 days')
                 AND occurred_at < datetime('now', '-7 days')
                THEN user_id END) as previous_users,
            COALESCE(SUM(CASE WHEN occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END), 0) as current_sessions,
            COALESCE(SUM(CASE
                WHEN occurred_at >= datetime('now', '-14 days')
                 AND occurred_at < datetime('now', '-7 days')
                THEN 1 ELSE 0 END), 0) as previous_sessions
        FROM focus
        WHERE occurred_at >= datetime('now', '-14 days')
    `).get(guildId, guildId, guildId);
}

function formatBuddyFunnelField(guildId) {
    let stats = null;
    try {
        stats = getBuddyFunnelStats({ days: 7, guildId });
    } catch (_) {
        return 'No PomoMatch data yet.';
    }
    if (!stats || stats.requests === 0) {
        return 'No PomoMatch activity in the last 7 days.';
    }
    const r = stats.rates;
    return (
        `Requests: **${stats.requests}** | Shown: **${stats.candidatesShown}** | ` +
        `Likes: **${stats.likes}** | Matches: **${stats.matches}** (like→match **${r.matchRate}%**)\n` +
        `Local matches: **${stats.localMatches}** | Global matches: **${stats.globalMatches}**\n` +
        `Destinations: **${stats.destinationsSelected}** (confirmed **${stats.destinationsConfirmed}**) | ` +
        `Hub invites: **${stats.invitesSent}** sent / **${stats.invitesFailed}** failed\n` +
        `Match→session: **${r.sessionConversion}%** | Sessions completed: **${stats.sessionsCompleted}** | ` +
        `Repeat users: **${stats.repeatUsers}**`
    );
}

function getTopContributor(guildId) {
    return db.prepare(`
        SELECT user_id, SUM(minutes) as minutes
        FROM (
            SELECT user_id, duration as minutes
            FROM study_sessions
            WHERE guild_id = ?
              AND completed = 1
              AND title != '__break__'
              AND started_at >= datetime('now', '-7 days')

            UNION ALL

            SELECT tm.user_id, ts.duration as minutes
            FROM team_members tm
            JOIN team_sessions ts ON tm.session_id = ts.id
            WHERE ts.guild_id = ?
              AND ts.status = 'completed'
              AND ts.started_at >= datetime('now', '-7 days')

            UNION ALL

            SELECT user_id, credited_minutes as minutes
            FROM voice_sessions
            WHERE guild_id = ?
              AND status = 'completed'
              AND credited_minutes > 0
              AND ended_at >= datetime('now', '-7 days')
        )
        GROUP BY user_id
        ORDER BY minutes DESC
        LIMIT 1
    `).get(guildId, guildId, guildId);
}

function formatChange(current, previous, language = 'en') {
    if (!previous) return current > 0 ? t(language, 'serverNewActivity') : t(language, 'serverNoChange');
    const percent = Math.round(((current - previous) / previous) * 100);
    if (percent === 0) return t(language, 'serverNoChange');
    return t(language, 'serverVsPreviousWeek', { percent: `${percent > 0 ? '+' : ''}${percent}` });
}

module.exports.getServerActivity = getServerActivity;
module.exports.getTopContributor = getTopContributor;
module.exports.formatChange = formatChange;
