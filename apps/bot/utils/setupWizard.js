const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const {
    getOrCreateGuildSettings,
    updateGuildSettings,
    getActiveVoiceSessions,
    getSetupNudgeEligibility,
    markSetupNudgeSent,
} = require('./database');
const {
    finishVoiceSession,
    startVoiceSession,
    isTrackedVoiceChannel,
} = require('./voiceManager');
const { Colors, SUPPORT_SERVER_URL } = require('./constants');
const { errorEmbed } = require('./embeds');
const { t } = require('./i18n');

const NUDGE_COMMANDS = new Set(['study', 'team', 'pomodoro']);

function isGuildConfigured(settings) {
    return Boolean(
        settings.voice_tracking_enabled
        || settings.report_enabled
        || settings.goal_enabled
    );
}

function isSetupComplete(settings = {}) {
    const checklist = getSetupChecklist(settings);
    return checklist.completed >= checklist.total;
}

function getSetupChecklist(settings = {}) {
    const items = [
        {
            key: 'voice',
            label: 'Voice tracking',
            done: Boolean(settings.voice_tracking_enabled),
            action: 'Choose a study voice channel/category',
        },
        {
            key: 'reports',
            label: 'Weekly reports',
            done: Boolean(settings.report_enabled),
            action: 'Choose a weekly report channel',
        },
        {
            key: 'goal',
            label: 'Weekly server goal',
            done: Boolean(settings.goal_enabled),
            action: 'Run `/goal setup` after the first sessions',
        },
    ];
    const completed = items.filter(item => item.done).length;
    return {
        items,
        completed,
        total: items.length,
        configured: completed > 0,
        scoreText: `${completed}/${items.length}`,
    };
}

function formatSetupChecklist(settings = {}) {
    const checklist = getSetupChecklist(settings);
    return checklist.items
        .map(item => `${item.done ? '✅' : '⬜'} **${item.label}**${item.done ? '' : ` - ${item.action}`}`)
        .join('\n');
}

function formatSetupNextAction(settings = {}) {
    const checklist = getSetupChecklist(settings);
    const next = checklist.items.find(item => !item.done);
    if (!next) {
        return 'Setup is complete. Share `/guide` with members and check `/serverstats` after a few study sessions.';
    }
    if (next.key === 'voice') {
        return 'Next: click **Configure Server** and choose the study voice channel or category members already use.';
    }
    if (next.key === 'reports') {
        return 'Next: click **Configure Server** and choose the channel where weekly progress reports should be posted.';
    }
    if (next.key === 'goal') {
        return 'Next: run `/goal setup` to add a shared weekly challenge after members have tried studying.';
    }
    return 'Next: click **Configure Server** or run `/setup start` to finish the server setup.';
}

function getSetupRecommendation(settings = {}) {
    const checklist = getSetupChecklist(settings);
    const missing = checklist.items.filter(item => !item.done).map(item => item.key);

    if (missing.length === 0) {
        return {
            title: 'Setup complete',
            body: 'PomoBot is ready for automatic tracking, weekly reporting, and shared goals.',
            impact: 'Keep sharing `/guide` with new members and review `/serverstats` weekly.',
        };
    }

    if (missing.includes('voice') && missing.includes('reports')) {
        return {
            title: 'Start with voice tracking and weekly reports',
            body: 'Choose the study voice channel/category and the report channel. This turns PomoBot from a manual timer into a server-wide study system.',
            impact: 'Members can study by joining voice, and managers get weekly proof of server activity.',
        };
    }

    if (missing.includes('voice')) {
        return {
            title: 'Add automatic voice tracking',
            body: 'Your server has some setup already, but voice tracking is still off.',
            impact: 'Members can earn focus credit from study voice channels without starting manual timers.',
        };
    }

    if (missing.includes('reports')) {
        return {
            title: 'Add weekly progress reports',
            body: 'Voice tracking or goals are configured, but reports are still off.',
            impact: 'A weekly report gives staff and members a visible reason to keep studying together.',
        };
    }

    return {
        title: 'Add a weekly server goal',
        body: 'Core setup is ready. A shared weekly goal gives the server one target to work toward together.',
        impact: 'Goals help turn quiet study activity into a community challenge.',
    };
}

// Buttons are passed a guild id when sent by DM, where interaction.guild is empty.
// A row holds at most five buttons.
function buildSetupButtonRow(guildId = null, language = 'en') {
    const quickId = guildId ? `setup_quick_${guildId}` : 'setup_quick';
    const autoId = guildId ? `setup_auto_${guildId}` : 'setup_auto';
    const wizardId = guildId ? `setup_wizard_open_${guildId}` : 'setup_wizard_open';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(quickId)
            .setLabel(t(language, 'setupQuickButton'))
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(autoId)
            .setLabel(t(language, 'setupFullButton'))
            .setStyle(ButtonStyle.Primary)
    );

    if (!guildId) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(wizardId)
                .setLabel('Manual Setup')
                .setStyle(ButtonStyle.Secondary)
        );
    }
    
    // Some buttons like guide panel post won't work in DM context since they require a channel,
    // so we only add them if we are not generating the row for a DM (guildId is null).
    if (!guildId) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('guide_post_panel')
                .setLabel('Post Guide Panel')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    row.addComponents(
        new ButtonBuilder()
            .setLabel('Setup Guide')
            .setStyle(ButtonStyle.Link)
            .setURL('https://pomofocus.online/tutorials/getting-started')
    );

    return row;
}

function buildSetupWizardRows() {
    const voiceRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('setup_wizard_voice')
            .setPlaceholder('Choose a voice channel or category')
            .setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1),
    );
    const reportRow = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('setup_wizard_report')
            .setPlaceholder('Choose a weekly report channel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1),
    );
    return [voiceRow, reportRow];
}

function buildSetupNextActionRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('guide_post_panel')
            .setLabel('Post Guide Panel')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel('Member Guide')
            .setStyle(ButtonStyle.Link)
            .setURL('https://pomofocus.online/tutorials/getting-started'),
        new ButtonBuilder()
            .setLabel('Support Server')
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_SERVER_URL),
    );
}

function buildSetupWizardRowsFor(settings = {}) {
    const rows = buildSetupWizardRows();
    const components = [];
    if (!settings.voice_tracking_enabled) components.push(rows[0]);
    if (!settings.report_enabled) components.push(rows[1]);
    return components.length > 0 ? components : [buildSetupNextActionRow()];
}

function buildSetupProgressEmbed(settings = {}, {
    title = 'Quick Server Setup',
    description,
    color = Colors.INFO,
} = {}) {
    const checklist = getSetupChecklist(settings);
    const recommendation = getSetupRecommendation(settings);
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description || recommendation.body)
        .addFields(
            {
                name: `Setup Progress: ${checklist.scoreText}`,
                value: formatSetupChecklist(settings),
                inline: false,
            },
            {
                name: recommendation.title,
                value: recommendation.impact,
                inline: false,
            },
            {
                name: 'Recommended next step',
                value: formatSetupNextAction(settings),
                inline: false,
            },
        )
        .setFooter({ text: 'Tip: /serverstats, /server quests, and /event status show your server activity.' })
        .setTimestamp();
}

async function maybeSendSetupNudge(interaction) {
    if (
        !interaction.guildId
        || interaction.guild === null
        || !NUDGE_COMMANDS.has(interaction.commandName)
        || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
        return false;
    }

    const eligibility = getSetupNudgeEligibility(interaction.guildId, 3);
    if (!eligibility) return false;

    const embed = buildSetupNudgeEmbed(eligibility);

    const message = await interaction.followUp({
        embeds: [embed],
        components: [buildSetupButtonRow()],
        flags: 64,
    }).catch(() => null);

    if (!message) return false;
    markSetupNudgeSent(interaction.guildId);
    return true;
}

function buildSetupNudgeEmbed(eligibility) {
    const recommendation = getSetupRecommendation(eligibility);
    return new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(recommendation.title)
        .setDescription(
            `Members completed **${eligibility.completed_sessions} focus sessions** in the last 7 days.\n\n` +
            `${recommendation.body}\n\n${recommendation.impact}\n\n` +
            'This suggestion is shown only once.'
        )
        .addFields(
            {
                name: 'What is missing',
                value: formatSetupChecklist(eligibility),
                inline: false,
            },
            {
                name: 'Recommended next step',
                value: formatSetupNextAction(eligibility),
                inline: false,
            },
        );
}

async function handleSetupWizardOpen(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            embeds: [errorEmbed('Missing Permission', 'You need the **Manage Server** permission to configure PomoBot.')],
            flags: 64,
        });
    }

    const settings = getOrCreateGuildSettings(interaction.guildId);
    const embed = buildSetupProgressEmbed(settings, {
        description: 'Choose a study voice channel/category and a weekly report channel. Each selection is saved immediately and can be changed later with `/setup start`.',
    });

    return interaction.reply({
        embeds: [embed],
        components: buildSetupWizardRowsFor(settings),
        flags: 64,
    });
}

async function handleSetupWizardChannel(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            embeds: [errorEmbed('Missing Permission', 'You need the **Manage Server** permission to configure PomoBot.')],
            flags: 64,
        });
    }

    const channelId = interaction.values[0];
    const channel = interaction.guild.channels.cache.get(channelId)
        || await interaction.guild.channels.fetch(channelId).catch(() => null);
    if (!channel) {
        return interaction.reply({
            embeds: [errorEmbed('Channel Missing', 'That channel could not be found.')],
            flags: 64,
        });
    }

    if (interaction.customId === 'setup_wizard_voice') {
        return configureVoiceTarget(interaction, channel);
    }
    return configureReportChannel(interaction, channel);
}

async function configureVoiceTarget(interaction, target) {
    if (![ChannelType.GuildVoice, ChannelType.GuildCategory].includes(target.type)) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'Choose a voice channel or category.')],
            flags: 64,
        });
    }

    getOrCreateGuildSettings(interaction.guildId);
    for (const session of getActiveVoiceSessions(interaction.guildId)) {
        await finishVoiceSession(interaction.client, session.user_id, interaction.guildId, {
            endReason: 'setup_reconfigured',
            notify: false,
        });
    }

    updateGuildSettings(interaction.guildId, {
        guild_name: interaction.guild.name,
        voice_tracking_enabled: 1,
        voice_target_id: target.id,
        voice_target_type: target.type === ChannelType.GuildCategory ? 'category' : 'channel',
        voice_rewards_enabled: 1,
        voice_min_minutes: 10,
        voice_daily_reward_cap: 240,
    });

    const settings = getOrCreateGuildSettings(interaction.guildId);
    let started = 0;
    for (const state of interaction.guild.voiceStates.cache.values()) {
        if (
            !state.member?.user?.bot
            && isTrackedVoiceChannel(interaction.guild, state.channelId, settings)
            && startVoiceSession(state.member.id, interaction.guildId, state.channelId)
        ) {
            started++;
        }
    }

    const finalSettings = getOrCreateGuildSettings(interaction.guildId);
    const label = target.type === ChannelType.GuildCategory ? `category **${target.name}**` : `${target}`;
    return respondWithSetupProgress(interaction, finalSettings, {
        title: 'Voice Tracking Enabled',
        description:
            `Tracking ${label} with a **10 minute** minimum and **240 minute** daily reward cap.\n` +
            `Members already inside started: **${started}**`,
    });
}

async function configureReportChannel(interaction, channel) {
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Channel', 'Choose a text or announcement channel.')],
            flags: 64,
        });
    }

    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ])) {
        return interaction.reply({
            embeds: [errorEmbed('Channel Permission Missing', `I cannot view, send messages, and embed links in ${channel}.`)],
            flags: 64,
        });
    }

    getOrCreateGuildSettings(interaction.guildId);
    updateGuildSettings(interaction.guildId, {
        guild_name: interaction.guild.name,
        report_enabled: 1,
        report_channel_id: channel.id,
    });

    const finalSettings = getOrCreateGuildSettings(interaction.guildId);
    return respondWithSetupProgress(interaction, finalSettings, {
        title: 'Weekly Reports Enabled',
        description: `Reports will be sent to ${channel} every Monday.`,
    });
}

function respondWithSetupProgress(interaction, settings, options) {
    const payload = {
        embeds: [buildSetupProgressEmbed(settings, { ...options, color: Colors.SUCCESS })],
        components: buildSetupWizardRowsFor(settings),
    };

    if (typeof interaction.update === 'function') {
        return interaction.update(payload);
    }

    return interaction.reply({ ...payload, flags: 64 });
}

module.exports = {
    NUDGE_COMMANDS,
    isGuildConfigured,
    isSetupComplete,
    buildSetupButtonRow,
    buildSetupWizardRows,
    buildSetupWizardRowsFor,
    buildSetupProgressEmbed,
    buildSetupNextActionRow,
    getSetupRecommendation,
    getSetupChecklist,
    formatSetupChecklist,
    formatSetupNextAction,
    maybeSendSetupNudge,
    buildSetupNudgeEmbed,
    handleSetupWizardOpen,
    handleSetupWizardChannel,
    configureVoiceTarget,
    configureReportChannel,
};
