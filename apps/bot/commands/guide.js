const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors, SUPPORT_SERVER_URL } = require('../utils/constants');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { getBotInviteUrl } = require('../utils/invite');
const { recordOnboardingEvent } = require('../utils/database');

const DASHBOARD_URL = 'https://pomofocus.online/dashboard';

const TOPICS = {
    quickstart: {
        titleKey: 'guideQuickstartTitle',
        bodyKey: 'guideQuickstartBody',
    },
    solo: {
        titleKey: 'guideSoloTitle',
        bodyKey: 'guideSoloBody',
    },
    voice: {
        titleKey: 'guideVoiceTitle',
        bodyKey: 'guideVoiceBody',
    },
    server: {
        titleKey: 'guideServerTitle',
        bodyKey: 'guideServerBody',
    },
    garden: {
        titleKey: 'guideGardenTitle',
        bodyKey: 'guideGardenBody',
    },
    activity: {
        titleKey: 'guideActivityTitle',
        bodyKey: 'guideActivityBody',
    },
};

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('Get a simple guide for using PomoBot')
        .addStringOption(option => option
            .setName('topic')
            .setDescription('What do you want to learn?')
            .addChoices(
                { name: 'Quick start', value: 'quickstart' },
                { name: 'Solo study', value: 'solo' },
                { name: 'Voice tracking', value: 'voice' },
                { name: 'Server setup', value: 'server' },
                { name: 'Garden & rewards', value: 'garden' },
                { name: 'Discord Activity', value: 'activity' },
            ))
        .addBooleanOption(option => option
            .setName('share')
            .setDescription('Post this guide publicly in the channel (server managers only)'))
        .addBooleanOption(option => option
            .setName('panel')
            .setDescription('Post an interactive onboarding panel for this server (server managers only)')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const topic = interaction.options.getString('topic') || 'quickstart';
        const wantsShare = interaction.options.getBoolean('share') || false;
        const wantsPanel = interaction.options.getBoolean('panel') || false;
        const canShare = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || false;

        if ((wantsShare || wantsPanel) && !canShare) {
            return interaction.reply({
                content: t(language, 'guideSharePermissionBody'),
                flags: 64,
            });
        }

        if (wantsPanel) {
            safeRecordOnboardingEvent(interaction.guildId, interaction.user?.id, 'panel_posted', null);
            return interaction.reply({
                embeds: [buildGuidePanelEmbed(language)],
                components: buildGuidePanelRows(language, interaction.client),
            });
        }

        const embed = buildGuideEmbed(topic, language);

        const replyOptions = { embeds: [embed] };
        if (!wantsShare) replyOptions.flags = 64;

        return interaction.reply(replyOptions);
    },
};

function buildGuideEmbed(topic = 'quickstart', language = 'en') {
    const guide = TOPICS[topic] || TOPICS.quickstart;
    return new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(t(language, guide.titleKey))
        .setDescription(t(language, guide.bodyKey))
        .addFields({
            name: t(language, 'guideNeedMoreHelpTitle'),
            value: t(language, 'guideNeedMoreHelpBody'),
        })
        .setFooter({ text: t(language, 'guideFooter') })
        .setTimestamp();
}

function buildGuidePanelEmbed(language = 'en') {
    return new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(t(language, 'guidePanelTitle'))
        .setDescription(t(language, 'guidePanelBody'))
        .addFields(
            {
                name: t(language, 'guidePanelStartTitle'),
                value: t(language, 'guidePanelStartBody'),
                inline: false,
            },
            {
                name: t(language, 'guidePanelManagersTitle'),
                value: t(language, 'guidePanelManagersBody'),
                inline: false,
            },
        )
        .setFooter({ text: t(language, 'guidePanelFooter') })
        .setTimestamp();
}

function buildGuidePanelRows(language = 'en', client = null) {
    const clientId = client?.application?.id || client?.user?.id || process.env.CLIENT_ID;
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('guide_panel_quickstart')
                .setLabel(t(language, 'guidePanelQuickStartButton'))
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('guide_panel_solo')
                .setLabel(t(language, 'guidePanelSoloButton'))
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('guide_panel_voice')
                .setLabel(t(language, 'guidePanelVoiceButton'))
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('guide_panel_garden')
                .setLabel(t(language, 'guidePanelGardenButton'))
                .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('guide_panel_server')
                .setLabel(t(language, 'guidePanelServerButton'))
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('guide_panel_activity')
                .setLabel(t(language, 'guidePanelActivityButton'))
                .setStyle(ButtonStyle.Secondary),
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(t(language, 'guidePanelInviteButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(getBotInviteUrl(clientId)),
            new ButtonBuilder()
                .setLabel(t(language, 'guidePanelDashboardButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(DASHBOARD_URL),
            new ButtonBuilder()
                .setLabel(t(language, 'guidePanelSupportButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL),
        ),
    ];
}

async function handleGuidePanelButton(interaction) {
    const topic = interaction.customId.replace('guide_panel_', '');
    const language = getInteractionLanguage(interaction);
    safeRecordOnboardingEvent(interaction.guildId, interaction.user?.id, 'panel_click', topic);
    return interaction.reply({
        embeds: [buildGuideEmbed(topic, language)],
        flags: 64,
    });
}

async function handleGuidePanelPostButton(interaction) {
    const language = getInteractionLanguage(interaction);
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            content: t(language, 'guideSharePermissionBody'),
            flags: 64,
        });
    }

    if (!interaction.channel?.isTextBased?.()) {
        return interaction.reply({
            content: t(language, 'guidePanelPostUnavailableBody'),
            flags: 64,
        });
    }

    const message = await interaction.channel.send({
        embeds: [buildGuidePanelEmbed(language)],
        components: buildGuidePanelRows(language, interaction.client),
        allowedMentions: { parse: [] },
    }).catch(() => null);

    if (!message) {
        return interaction.reply({
            content: t(language, 'guidePanelPostFailedBody'),
            flags: 64,
        });
    }

    safeRecordOnboardingEvent(interaction.guildId, interaction.user?.id, 'panel_posted', null);
    return interaction.reply({
        content: t(language, 'guidePanelPostedBody'),
        flags: 64,
    });
}

function safeRecordOnboardingEvent(guildId, userId, eventType, topic = null) {
    try {
        recordOnboardingEvent(guildId, userId, eventType, topic);
    } catch (error) {
        console.error('[ONBOARDING] Failed to record guide panel event:', error.message);
    }
}

module.exports.buildGuideEmbed = buildGuideEmbed;
module.exports.buildGuidePanelEmbed = buildGuidePanelEmbed;
module.exports.buildGuidePanelRows = buildGuidePanelRows;
module.exports.handleGuidePanelButton = handleGuidePanelButton;
module.exports.handleGuidePanelPostButton = handleGuidePanelPostButton;
