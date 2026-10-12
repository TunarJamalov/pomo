const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { db, getOrCreateGuildSettings } = require('../utils/database');
const { getWeekStart } = require('../utils/timezone');

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('health')
        .setDescription('View server health dashboard and recommendations')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                embeds: [errorEmbed('Permission Denied', 'You need the **Manage Server** permission.')],
                flags: 64,
            });
        }

        const settings = getOrCreateGuildSettings(interaction.guildId);
        const guildId = interaction.guildId;
        const tz = settings.timezone || 'UTC';

        // Use guild timezone for week start
        const weekStart = getWeekStart(new Date(), tz);

        const focusResult = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as active_users, 
                   SUM(duration) as total_minutes,
                   COUNT(*) as total_sessions
            FROM study_sessions
            WHERE guild_id = ? AND completed = 1 AND title != '__break__'
              AND started_at >= ?
        `).get(guildId, weekStart);

        const voiceResult = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as voice_users, SUM(credited_minutes) as voice_minutes
            FROM voice_sessions
            WHERE guild_id = ? AND status = 'completed' AND ended_at >= ?
        `).get(guildId, weekStart);

        const commandResult = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as command_users
            FROM command_usage
            WHERE guild_id = ? AND used_at >= ?
        `).get(guildId, weekStart);

        const activeUsers = Math.max(focusResult?.active_users || 0, voiceResult?.voice_users || 0, commandResult?.command_users || 0);
        const totalMinutes = (focusResult?.total_minutes || 0) + (voiceResult?.voice_minutes || 0);
        const totalSessions = (focusResult?.total_sessions || 0);

        const memberCount = interaction.guild.memberCount || 0;
        const engagement = memberCount > 0 ? Math.round((activeUsers / memberCount) * 100) : 0;

        const hasVoice = settings.voice_tracking_enabled ? 1 : 0;
        const hasReports = settings.report_enabled ? 1 : 0;
        const hasGoals = settings.goal_enabled ? 1 : 0;
        const setupScore = hasVoice + hasReports + hasGoals;
        const setupPct = Math.round((setupScore / 3) * 100);

        const engColor = engagement >= 30 ? '🟢' : engagement >= 10 ? '🟡' : '🔴';
        const actColor = activeUsers >= 10 ? '🟢' : activeUsers >= 3 ? '🟡' : '🔴';
        const setupColor = setupPct >= 66 ? '🟢' : setupPct >= 33 ? '🟡' : '🔴';

        // Best day — exclude breaks, use guild timezone
        const bestDayResult = db.prepare(`
            SELECT strftime('%w', started_at) as day_num, COUNT(*) as sessions
            FROM study_sessions
            WHERE guild_id = ? AND completed = 1 AND title != '__break__'
              AND started_at >= ?
            GROUP BY day_num ORDER BY sessions DESC LIMIT 1
        `).get(guildId, weekStart);

        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const bestDay = bestDayResult ? dayNames[parseInt(bestDayResult.day_num)] : 'Not enough data';

        const recommendations = [];
        if (!settings.voice_tracking_enabled) recommendations.push('🎙️ Enable voice tracking with `/setup start`');
        if (!settings.goal_enabled) recommendations.push('🎯 Set a weekly server goal with `/goal setup`');
        if (!settings.report_enabled) recommendations.push('📊 Enable weekly reports with `/setup start`');
        if (activeUsers > 3 && !settings.goal_enabled) recommendations.push('🤝 Create a community challenge with `/challenge create`');
        if (activeUsers < 3) recommendations.push('📣 Share `/invite` and `/guide` to grow activity');
        if (recommendations.length === 0) recommendations.push('✅ Looking great! Keep sharing `/guide` with new members.');

        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle('📊 Server Health Dashboard')
            .setDescription(`Health report for **${interaction.guild.name}** (${tz})`)
            .addFields(
                { name: `${engColor} Engagement`, value: `**${engagement}%**\n${activeUsers} active users / ${memberCount} total`, inline: true },
                { name: `${actColor} Focus Activity`, value: `**${totalMinutes} min**\n${totalSessions} sessions this week`, inline: true },
                { name: `${setupColor} Setup Completion`, value: `**${setupPct}%**\n${setupScore}/3 features configured`, inline: true },
                { name: '📅 Best Day', value: bestDay, inline: true },
                { name: '🎯 Recommendations', value: recommendations.join('\n'), inline: false },
            )
            .setTimestamp()
            .setFooter({ text: 'Health data covers the last 7 days' });

        return interaction.reply({ embeds: [embed], flags: 64 });
    },
};
