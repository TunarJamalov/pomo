const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
} = require('discord.js');
const {
    getOrCreateGuildSettings,
    updateGuildSettings,
    updateGuildTimezone,
    getActiveVoiceSessions,
    isGlobalBuddyMatchingEnabled,
    isStudyHubEnabled,
    isStudyHubAcceptingGuests,
} = require('../utils/database');
const {
    finishVoiceSession,
    startVoiceSession,
    isTrackedVoiceChannel,
} = require('../utils/voiceManager');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const {
    buildSetupButtonRow,
    isGuildConfigured,
    isSetupComplete,
    getSetupChecklist,
    formatSetupChecklist,
    formatSetupNextAction,
    buildSetupNextActionRow,
} = require('../utils/setupWizard');
const { normalizeTimeZone } = require('../utils/timezone');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure PomoBot for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Set up voice tracking and weekly reports')
            .addChannelOption(opt => opt
                .setName('voice_target')
                .setDescription('Voice channel or category to track')
                .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildCategory))
            .addChannelOption(opt => opt
                .setName('report_channel')
                .setDescription('Text channel for weekly reports')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
            .addBooleanOption(opt => opt
                .setName('voice_rewards')
                .setDescription('Reward tracked voice focus (default: on)'))
            .addIntegerOption(opt => opt
                .setName('minimum')
                .setDescription('Minimum voice session length (default: 10 minutes)')
                .setMinValue(5)
                .setMaxValue(60))
            .addIntegerOption(opt => opt
                .setName('daily_cap')
                .setDescription('Daily rewarded voice minutes (default: 240)')
                .setMinValue(25)
                .setMaxValue(720)))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View the current server configuration'))
        .addSubcommand(sub => sub
            .setName('timezone')
            .setDescription('Set the server timezone for weekly goals and reports')
            .addStringOption(opt => opt
                .setName('timezone')
                .setDescription('IANA timezone, e.g. UTC, Asia/Baku, Europe/Istanbul')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('reset')
            .setDescription('Disable voice tracking and weekly reports'))
        .addSubcommand(sub => sub
            .setName('globalmatch')
            .setDescription('Enable, disable, or view Global PomoMatch participation (Admin only)')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('True to join the global buddy pool, False to stay local-only (omit to view status)')
                .setRequired(false)))
        .addSubcommand(sub => sub
            .setName('studyhub')
            .setDescription('Register, pause, or view Study Hub hosting for PomoMatch (Admin only)')
            .addBooleanOption(opt => opt
                .setName('enabled')
                .setDescription('True to register as a Study Hub, False to unregister (omit to view status)')
                .setRequired(false))
            .addBooleanOption(opt => opt
                .setName('accepts_guests')
                .setDescription('True to accept cross-server guests, False to pause intake (omit to leave unchanged)')
                .setRequired(false))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'missingPermissionTitle'), t(language, 'manageServerRequired'))],
                flags: 64,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'start') return handleStart(interaction, language);
        if (subcommand === 'timezone') return handleTimezone(interaction, language);
        if (subcommand === 'reset') return handleReset(interaction, language);
        if (subcommand === 'globalmatch') return handleGlobalMatch(interaction, language);
        if (subcommand === 'studyhub') return handleStudyHub(interaction, language);
        return handleStatus(interaction, language);
    },
};

async function handleStart(interaction, language) {
    const voiceTarget = interaction.options.getChannel('voice_target');
    const reportChannel = interaction.options.getChannel('report_channel');
    const rewards = interaction.options.getBoolean('voice_rewards');
    const minimum = interaction.options.getInteger('minimum');
    const dailyCap = interaction.options.getInteger('daily_cap');

    if (!voiceTarget && !reportChannel) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'nothingSelectedTitle'), t(language, 'setupNothingSelectedBody'))],
            flags: 64,
        });
    }

    if (reportChannel) {
        const permissions = reportChannel.permissionsFor(interaction.guild.members.me);
        if (!permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
        ])) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'channelPermissionMissingTitle'),
                    t(language, 'setupChannelPermissionBody', { channel: reportChannel })
                )],
                flags: 64,
            });
        }
    }

    getOrCreateGuildSettings(interaction.guildId);
    const updates = { guild_name: interaction.guild.name };

    if (voiceTarget) {
        for (const session of getActiveVoiceSessions(interaction.guildId)) {
            await finishVoiceSession(interaction.client, session.user_id, interaction.guildId, {
                endReason: 'setup_reconfigured',
                notify: false,
            });
        }

        updates.voice_tracking_enabled = 1;
        updates.voice_target_id = voiceTarget.id;
        updates.voice_target_type = voiceTarget.type === ChannelType.GuildCategory ? 'category' : 'channel';
        updates.voice_rewards_enabled = rewards === null ? 1 : Number(rewards);
        updates.voice_min_minutes = minimum || 10;
        updates.voice_daily_reward_cap = dailyCap || 240;
    }

    if (reportChannel) {
        updates.report_enabled = 1;
        updates.report_channel_id = reportChannel.id;
    }

    updateGuildSettings(interaction.guildId, updates);

    let started = 0;
    if (voiceTarget) {
        const settings = getOrCreateGuildSettings(interaction.guildId);
        for (const state of interaction.guild.voiceStates.cache.values()) {
            if (
                !state.member?.user?.bot
                && isTrackedVoiceChannel(interaction.guild, state.channelId, settings)
                && startVoiceSession(state.member.id, interaction.guildId, state.channelId)
            ) {
                started++;
            }
        }
    }

    const lines = [t(language, 'setupReadyLine')];
    if (voiceTarget) {
        lines.push(t(language, 'setupVoiceTrackingLine', { target: voiceTarget }));
        lines.push(t(language, 'setupMinimumLine', { minimum: minimum || 10, dailyCap: dailyCap || 240 }));
        lines.push(t(language, 'setupMembersLine', { count: started }));
    }
    if (reportChannel) lines.push(t(language, 'setupReportsLine', { channel: reportChannel }));
    lines.push(`\n${t(language, 'setupCommandsLine')}`);

    const finalSettings = getOrCreateGuildSettings(interaction.guildId);
    const finalChecklist = getSetupChecklist(finalSettings);
    const embed = successEmbed(t(language, 'setupCompleteTitle'), lines.join('\n'))
        .addFields(
            {
                name: `Setup Progress: ${finalChecklist.scoreText}`,
                value: formatSetupChecklist(finalSettings),
                inline: false,
            },
            {
                name: t(language, 'setupShareField'),
                value: t(language, 'setupShareBody'),
                inline: false,
            },
            {
                name: t(language, 'setupNextStepField'),
                value: t(language, 'setupAfterCompleteNextStepBody'),
                inline: false,
            },
        )
        .setFooter({ text: t(language, 'setupFooter') });

    return interaction.reply({
        embeds: [embed],
        components: [buildSetupNextActionRow()],
    });
}

async function handleStatus(interaction, language) {
    const settings = getOrCreateGuildSettings(interaction.guildId);
    const configured = isGuildConfigured(settings);
    const checklist = getSetupChecklist(settings);
    const voiceTarget = settings.voice_target_id
        ? interaction.guild.channels.cache.get(settings.voice_target_id)
        : null;
    const reportChannel = settings.report_channel_id
        ? interaction.guild.channels.cache.get(settings.report_channel_id)
        : null;

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'setupStatusTitle'))
        .setDescription(configured
            ? t(language, 'setupStatusConfiguredBody')
            : t(language, 'setupStatusUnconfiguredBody'))
        .addFields(
            {
                name: `Setup Progress: ${checklist.scoreText}`,
                value: formatSetupChecklist(settings),
                inline: false,
            },
            {
                name: t(language, 'setupVoiceTrackingField'),
                value: settings.voice_tracking_enabled
                    ? `${settings.voice_target_type === 'all' ? `**${t(language, 'allVoiceChannelsLabel')}**` : voiceTarget || t(language, 'configuredChannelMissing')}\n${t(language, 'voiceSettingsMinimum')} ${settings.voice_min_minutes || 10}m | ${t(language, 'voiceSettingsDailyCap')} ${settings.voice_daily_reward_cap || 240}m`
                    : t(language, 'disabled'),
                inline: true,
            },
            {
                name: t(language, 'setupWeeklyReportsField'),
                value: settings.report_enabled
                    ? `${reportChannel || t(language, 'configuredChannelMissing')}`
                    : t(language, 'disabled'),
                inline: true,
            },
            {
                name: t(language, 'setupTimezoneField'),
                value: settings.timezone || 'UTC',
                inline: true,
            },
            {
                name: t(language, 'setupNextStepField'),
                value: configured
                    ? `${t(language, 'setupNextStepBody')}\n${formatSetupNextAction(settings)}`
                    : formatSetupNextAction(settings),
                inline: false,
            },
        )
        .setTimestamp();

    return interaction.reply({
        embeds: [embed],
        components: isSetupComplete(settings) ? [buildSetupNextActionRow()] : [buildSetupButtonRow(null, 'en', interaction.guild)],
        flags: 64,
    });
}

async function handleTimezone(interaction, language) {
    const requested = interaction.options.getString('timezone', true);
    const normalized = normalizeTimeZone(requested);
    if (!normalized) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'invalidTimezoneTitle'),
                t(language, 'invalidTimezoneBody', { timezone: requested })
            )],
            flags: 64,
        });
    }

    const settings = updateGuildTimezone(interaction.guildId, normalized);
    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'timezoneUpdatedTitle'),
            t(language, 'timezoneUpdatedBody', { timezone: settings.timezone || normalized })
        )],
        flags: 64,
    });
}

async function handleGlobalMatch(interaction, language) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            embeds: [errorEmbed('Permission Denied', 'You need the Manage Server permission to change Global PomoMatch participation.')],
            flags: 64,
        });
    }

    const enabled = interaction.options.getBoolean('enabled');

    if (enabled === null) {
        const on = isGlobalBuddyMatchingEnabled(interaction.guildId);
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('🌐 Global PomoMatch')
                .setDescription(
                    `Global buddy matching is currently **${on ? 'ENABLED' : 'DISABLED'}** on this server.\n\n` +
                    (on
                        ? 'Members waiting with `/findbuddy` can be matched with compatible users from other opted-in servers.'
                        : 'Members waiting with `/findbuddy` are only matched within this server.\n\n' +
                          'Run `/setup globalmatch enabled:True` to join the global buddy pool.')
                )
                .setTimestamp()],
            flags: 64,
        });
    }

    getOrCreateGuildSettings(interaction.guildId);
    updateGuildSettings(interaction.guildId, { global_buddy_matching_enabled: enabled ? 1 : 0 });

    return interaction.reply({
        embeds: [successEmbed(
            enabled ? 'Global PomoMatch Enabled' : 'Global PomoMatch Disabled',
            enabled
                ? 'This server now participates in the global buddy pool. Members using `/findbuddy` can match with compatible users from other opted-in servers.'
                : 'This server left the global buddy pool. Members using `/findbuddy` will only match within this server. Pending requests stay active locally.'
        )],
        flags: 64,
    });
}

async function handleStudyHub(interaction, language) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            embeds: [errorEmbed('Permission Denied', 'You need the Manage Server permission to change Study Hub hosting.')],
            flags: 64,
        });
    }

    const enabled = interaction.options.getBoolean('enabled');
    const acceptsGuests = interaction.options.getBoolean('accepts_guests');

    if (enabled === null && acceptsGuests === null) {
        const hubOn = isStudyHubEnabled(interaction.guildId);
        const accepting = isStudyHubAcceptingGuests(interaction.guildId);
        const globalOn = isGlobalBuddyMatchingEnabled(interaction.guildId);
        const eligible = hubOn && accepting && globalOn;
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('🏫 Study Hub')
                .setDescription(
                    `Study Hub hosting is currently **${hubOn ? 'ENABLED' : 'DISABLED'}** on this server.\n` +
                    `Guest intake: **${accepting ? 'OPEN' : 'PAUSED'}**\n` +
                    `Global PomoMatch: **${globalOn ? 'ENABLED' : 'DISABLED'}**\n` +
                    `Eligible to host cross-server guests: **${eligible ? 'YES' : 'NO'}**\n\n` +
                    (eligible
                        ? 'This server may host cross-server PomoMatch users in a future update. Nothing moves automatically.'
                        : 'Run `/setup studyhub enabled:True` to register. A hub also needs Global PomoMatch enabled and open guest intake to become eligible.')
                )
                .setTimestamp()],
            flags: 64,
        });
    }

    getOrCreateGuildSettings(interaction.guildId);
    const updates = {};
    if (enabled !== null) updates.study_hub_enabled = enabled ? 1 : 0;
    if (acceptsGuests !== null) updates.study_hub_accepts_guests = acceptsGuests ? 1 : 0;
    updateGuildSettings(interaction.guildId, updates);

    const hubOn = enabled !== null ? enabled : isStudyHubEnabled(interaction.guildId);
    const accepting = acceptsGuests !== null ? acceptsGuests : isStudyHubAcceptingGuests(interaction.guildId);
    const globalOn = isGlobalBuddyMatchingEnabled(interaction.guildId);

    if (hubOn && !globalOn) {
        return interaction.reply({
            embeds: [successEmbed(
                'Study Hub Registered',
                'This server is registered as a Study Hub, but it is **not yet eligible** to host guests because Global PomoMatch is disabled.\n\n' +
                'Run `/setup globalmatch enabled:True` to complete eligibility. No users are moved or invited automatically.'
            )],
            flags: 64,
        });
    }

    return interaction.reply({
        embeds: [successEmbed(
            hubOn ? 'Study Hub Updated' : 'Study Hub Unregistered',
            hubOn
                ? `Guest intake is now **${accepting ? 'OPEN' : 'PAUSED'}**. ${accepting && globalOn ? 'This server is now eligible to host cross-server guests in a future update.' : 'Eligibility also requires Global PomoMatch and open intake.'} Nothing moves automatically.`
                : 'This server will no longer host cross-server PomoMatch users. Local matching is unaffected.'
        )],
        flags: 64,
    });
}

async function handleReset(interaction, language) {
    const activeSessions = getActiveVoiceSessions(interaction.guildId);
    for (const session of activeSessions) {
        await finishVoiceSession(interaction.client, session.user_id, interaction.guildId, {
            endReason: 'setup_reset',
            notify: false,
        });
    }

    updateGuildSettings(interaction.guildId, {
        voice_tracking_enabled: 0,
        voice_target_id: null,
        voice_target_type: null,
        report_enabled: 0,
        report_channel_id: null,
    });

    return interaction.reply({
        embeds: [successEmbed(t(language, 'setupResetTitle'), t(language, 'setupResetBody'))],
        flags: 64,
    });
}

module.exports.handleGlobalMatch = handleGlobalMatch;
module.exports.handleStudyHub = handleStudyHub;
