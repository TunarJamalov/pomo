const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
} = require('discord.js');
const {
    db,
    getOrCreateGuildSettings,
    updateGuildSettings,
    getVoiceStats,
    getActiveVoiceSessions,
} = require('../utils/database');
const {
    finishVoiceSession,
    startVoiceSession,
    isTrackedVoiceChannel,
} = require('../utils/voiceManager');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed, formatTime } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { buildSetupButtonRow, isGuildConfigured } = require('../utils/setupWizard');
const { getDayWindow, getWeekWindow, toSqlDateTime } = require('../utils/timezone');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Manage automatic voice study tracking')
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Enable voice tracking for a channel or category')
            .addChannelOption(opt => opt
                .setName('target')
                .setDescription('Study voice channel or category')
                .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildCategory)
                .setRequired(true))
            .addBooleanOption(opt => opt
                .setName('rewards')
                .setDescription('Give water and XP rewards (default: on)'))
            .addIntegerOption(opt => opt
                .setName('minimum')
                .setDescription('Minimum tracked session in minutes (default: 10)')
                .setMinValue(5)
                .setMaxValue(60))
            .addIntegerOption(opt => opt
                .setName('daily_cap')
                .setDescription('Daily rewarded voice minutes per user (default: 240)')
                .setMinValue(25)
                .setMaxValue(720)))
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable automatic voice tracking'))
        .addSubcommand(sub => sub
            .setName('settings')
            .setDescription('View this server\'s voice tracking settings'))
        .addSubcommand(sub => sub
            .setName('dms')
            .setDescription('Turn the summary DMs after voice sessions on or off')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('Send members a summary DM')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('stats')
            .setDescription('View voice study statistics')
            .addUserOption(opt => opt
                .setName('user')
                .setDescription('User to inspect')))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('View this server\'s voice study leaderboard')
            .addStringOption(opt => opt
                .setName('period')
                .setDescription('Leaderboard period')
                .addChoices(
                    { name: 'Today', value: 'today' },
                    { name: 'This week', value: 'week' },
                    { name: 'All time', value: 'all' },
                )))
        .addSubcommand(sub => sub
            .setName('active')
            .setDescription('View active tracked voice study sessions')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        if (!interaction.guild) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'serverOnlyTitle'), t(language, 'serverOnlyBody'))],
                flags: 64,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'setup' || subcommand === 'disable' || subcommand === 'dms') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'missingPermissionTitle'), t(language, 'manageServerRequired'))],
                    flags: 64,
                });
            }
        }

        if (subcommand === 'setup') return handleSetup(interaction, language);
        if (subcommand === 'disable') return handleDisable(interaction, language);
        if (subcommand === 'dms') return handleDms(interaction, language);
        if (subcommand === 'settings') return handleSettings(interaction, language);
        if (subcommand === 'stats') return handleStats(interaction, language);
        if (subcommand === 'leaderboard') return handleLeaderboard(interaction, language);
        return handleActive(interaction, language);
    },
};

async function handleSetup(interaction, language) {
    const target = interaction.options.getChannel('target', true);
    const rewards = interaction.options.getBoolean('rewards');
    const minimum = interaction.options.getInteger('minimum');
    const dailyCap = interaction.options.getInteger('daily_cap');
    const targetType = target.type === ChannelType.GuildCategory ? 'category' : 'channel';

    getOrCreateGuildSettings(interaction.guildId);
    // Closing the current voice sessions can take longer than Discord's 3 second window
    await interaction.deferReply();

    const previousSessions = getActiveVoiceSessions(interaction.guildId);
    for (const session of previousSessions) {
        await finishVoiceSession(interaction.client, session.user_id, interaction.guildId, {
            endReason: 'tracking_reconfigured',
            notify: false,
        });
    }

    updateGuildSettings(interaction.guildId, {
        voice_tracking_enabled: 1,
        voice_target_id: target.id,
        voice_target_type: targetType,
        voice_rewards_enabled: rewards === null ? 1 : Number(rewards),
        voice_min_minutes: minimum || 10,
        voice_daily_reward_cap: dailyCap || 240,
        guild_name: interaction.guild.name,
    });

    const settings = getOrCreateGuildSettings(interaction.guildId);
    let startedSessions = 0;
    for (const state of interaction.guild.voiceStates.cache.values()) {
        if (
            !state.member?.user?.bot
            && isTrackedVoiceChannel(interaction.guild, state.channelId, settings)
            && startVoiceSession(state.member.id, interaction.guildId, state.channelId)
        ) {
            startedSessions++;
        }
    }

    const targetLabel = targetType === 'category' ? `**${target.name}**` : `<#${target.id}>`;
    await interaction.editReply({
        embeds: [successEmbed(
            t(language, 'voiceTrackingEnabledTitle'),
            [
                t(language, 'voiceSetupTracking', { target: targetLabel }),
                t(language, 'voiceSetupRewards', { value: t(language, rewards === false ? 'off' : 'on') }),
                t(language, 'voiceSetupMinimum', { minutes: minimum || 10 }),
                t(language, 'voiceSetupDailyCap', { minutes: dailyCap || 240 }),
                t(language, 'voiceSetupStarted', { count: startedSessions }),
            ].join('\n')
        )],
    });
}

async function handleDisable(interaction, language) {
    await interaction.deferReply();
    const active = getActiveVoiceSessions(interaction.guildId);
    for (const session of active) {
        await finishVoiceSession(interaction.client, session.user_id, interaction.guildId, {
            endReason: 'tracking_disabled',
            notify: false,
        });
    }

    updateGuildSettings(interaction.guildId, {
        voice_tracking_enabled: 0,
        voice_target_id: null,
        voice_target_type: null,
    });

    await interaction.editReply({
        embeds: [successEmbed(t(language, 'voiceTrackingDisabledTitle'), t(language, 'voiceDisableClosed', { count: active.length }))],
    });
}

async function handleDms(interaction, language) {
    const enabled = interaction.options.getBoolean('enabled', true);
    getOrCreateGuildSettings(interaction.guildId);
    updateGuildSettings(interaction.guildId, { voice_summary_dm: enabled ? 1 : 0 });
    return interaction.reply({
        embeds: [successEmbed(t(language, 'voiceDmsUpdatedTitle'), t(language, enabled ? 'voiceDmsOnBody' : 'voiceDmsOffBody'))],
    });
}

async function handleSettings(interaction, language) {
    const settings = getOrCreateGuildSettings(interaction.guildId);
    const configured = isGuildConfigured(settings);
    const target = settings.voice_target_id
        ? interaction.guild.channels.cache.get(settings.voice_target_id)
        : null;
    const targetText = settings.voice_target_type === 'all'
        ? `**${t(language, 'allVoiceChannelsLabel')}**`
        : target
            ? settings.voice_target_type === 'category' ? `${t(language, 'categoryLabel')}: **${target.name}**` : `<#${target.id}>`
            : t(language, 'notConfigured');

    const embed = new EmbedBuilder()
        .setColor(settings.voice_tracking_enabled ? Colors.SUCCESS : Colors.WARNING)
        .setTitle(t(language, 'voiceTrackingSettingsTitle'))
        .addFields(
            { name: t(language, 'voiceSettingsStatus'), value: settings.voice_tracking_enabled ? t(language, 'enabled') : t(language, 'disabled'), inline: true },
            { name: t(language, 'voiceSettingsTarget'), value: targetText, inline: true },
            { name: t(language, 'voiceSettingsRewards'), value: settings.voice_rewards_enabled ? t(language, 'enabled') : t(language, 'disabled'), inline: true },
            { name: t(language, 'voiceSettingsMinimum'), value: `${settings.voice_min_minutes || 10} ${t(language, 'minutes')}`, inline: true },
            { name: t(language, 'voiceSettingsDailyCap'), value: `${settings.voice_daily_reward_cap || 240} ${t(language, 'minutes')}`, inline: true },
            { name: t(language, 'voiceSettingsAfk'), value: t(language, 'voiceSettingsAfkValue'), inline: true },
            { name: t(language, 'voiceSettingsDms'), value: settings.voice_summary_dm === 0 ? t(language, 'disabled') : t(language, 'enabled'), inline: true },
        )
        .setTimestamp();

    if (!configured) {
        embed.addFields({
            name: t(language, 'voiceSettingsSetupHintField'),
            value: t(language, 'voiceSettingsSetupHintBody'),
            inline: false,
        });
    }

    await interaction.reply({
        embeds: [embed],
        components: configured ? [] : [buildSetupButtonRow(null, 'en', interaction.guild)],
    });
}

async function handleStats(interaction, language) {
    const target = interaction.options.getUser('user') || interaction.user;
    const settings = getOrCreateGuildSettings(interaction.guildId);
    const dayWindow = getDayWindow(new Date(), settings.timezone || 'UTC');
    const weekWindow = getWeekWindow(new Date(), settings.timezone || 'UTC');
    const stats = getVoiceStats(target.id);
    const today = db.prepare(`
        SELECT COUNT(*) as sessions,
               COALESCE(SUM(credited_minutes), 0) as minutes
        FROM voice_sessions
        WHERE user_id = ? AND status = 'completed' AND ended_at >= ? AND ended_at < ?
    `).get(target.id, toSqlDateTime(dayWindow.startUtc), toSqlDateTime(dayWindow.endUtc));
    const week = db.prepare(`
        SELECT COUNT(*) as sessions,
               COALESCE(SUM(credited_minutes), 0) as minutes
        FROM voice_sessions
        WHERE user_id = ? AND status = 'completed' AND ended_at >= ? AND ended_at < ?
    `).get(target.id, toSqlDateTime(weekWindow.startUtc), toSqlDateTime(weekWindow.endUtc));

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'voiceStatsTitle', { username: target.username }))
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
            { name: t(language, 'todayLabel'), value: `${formatTime(today.minutes)} | ${today.sessions} ${t(language, 'sessionCount')}`, inline: false },
            { name: t(language, 'thisWeekLabel'), value: `${formatTime(week.minutes)} | ${week.sessions} ${t(language, 'sessionCount')}`, inline: false },
            { name: t(language, 'allTimeLabel'), value: `${formatTime(stats.minutes)} | ${stats.sessions} ${t(language, 'sessionCount')}`, inline: false },
            { name: t(language, 'voiceRewardsField'), value: `${stats.water} ${t(language, 'waterLabel')} | ${stats.xp} XP`, inline: false },
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction, language) {
    const period = interaction.options.getString('period') || 'week';
    const settings = getOrCreateGuildSettings(interaction.guildId);
    const timeZone = settings.timezone || 'UTC';
    let condition = '';
    const params = [interaction.guildId];
    if (period === 'today') {
        const window = getDayWindow(new Date(), timeZone);
        condition = 'AND ended_at >= ? AND ended_at < ?';
        params.push(toSqlDateTime(window.startUtc), toSqlDateTime(window.endUtc));
    } else if (period === 'week') {
        const window = getWeekWindow(new Date(), timeZone);
        condition = 'AND ended_at >= ? AND ended_at < ?';
        params.push(toSqlDateTime(window.startUtc), toSqlDateTime(window.endUtc));
    }
    const rows = db.prepare(`
        SELECT user_id, SUM(credited_minutes) as minutes, COUNT(*) as sessions
        FROM voice_sessions
        WHERE guild_id = ? AND status = 'completed' ${condition}
        GROUP BY user_id
        HAVING minutes > 0
        ORDER BY minutes DESC
        LIMIT 10
    `).all(...params);

    const labels = { today: t(language, 'todayLabel'), week: t(language, 'thisWeekLabel'), all: t(language, 'allTimeLabel') };
    const medals = ['🥇', '🥈', '🥉'];
    const description = rows.length
        ? rows.map((row, index) =>
            `${medals[index] || `**${index + 1}.**`} <@${row.user_id}> - **${formatTime(row.minutes)}** (${row.sessions})`
        ).join('\n')
        : t(language, 'noVoiceSessionsPeriod');

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(t(language, 'voiceLeaderboardTitle', { period: labels[period] }))
        .setDescription(description)
        .setFooter({ text: t(language, 'voiceLeaderboardHint') })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleActive(interaction, language) {
    const sessions = getActiveVoiceSessions(interaction.guildId);
    const rows = [];
    for (const session of sessions.slice(0, 20)) {
        const channel = interaction.guild.channels.cache.get(session.channel_id);
        const elapsed = Math.max(0, Math.floor(
            (Date.now() - new Date(`${session.started_at.replace(' ', 'T')}Z`).getTime()) / 60000
        ));
        rows.push(`<@${session.user_id}> - ${channel ? `<#${channel.id}>` : t(language, 'unknownChannel')} - ${formatTime(elapsed)}`);
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'activeVoiceSessionsTitle', { count: sessions.length }))
        .setDescription(rows.length ? rows.join('\n') : t(language, 'noOneTracked'))
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
