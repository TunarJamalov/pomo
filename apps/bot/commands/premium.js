const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors, SUPPORT_SERVER_URL } = require('../utils/constants');
const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { db } = require('../utils/database');
const { isProActive } = require('../utils/premiumManager');
const { getPremiumStatus } = require('../utils/premiumCheck');
const { getInteractionLanguage, t } = require('../utils/i18n');

const WEBSITE_SUPPORT_URL = 'https://pomofocus.online/support';
const DONATION_URL = process.env.POMO_DONATION_URL || 'https://boosty.to/pomobot';

module.exports = {
    cooldown: 3,
        data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('View your Pomo Pro status and beta perks')
        .addSubcommand(option =>
            option.setName('status')
                .setDescription('View your current Pomo Pro access'))
        .addSubcommand(option =>
            option.setName('perks')
                .setDescription('See what is included in Pomo Pro Beta'))
        .addSubcommand(option =>
            option.setName('activate')
                .setDescription('Verify your Boosty subscription and activate Pomo Pro')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'perks') {
            return interaction.reply({
                embeds: [buildPerksEmbed(language)],
                components: [buildLinks(language)],
                flags: 64,
            });
        }

        if (subcommand === 'activate') {
            return handleActivate(interaction, language);
        }

        await interaction.deferReply({ flags: 64 });
        const status = await getPremiumStatus(interaction.client, interaction.user.id);
        const embed = new EmbedBuilder()
            .setColor(status.active ? Colors.MARKET : Colors.INFO)
            .setTitle(status.active ? t(language, 'premiumActiveTitle') : t(language, 'premiumTitle'))
            .setTimestamp();

        if (status.active) {
            embed.setDescription(
                t(language, 'premiumActiveBody')
            ).addFields(
                { name: t(language, 'premiumPlan'), value: formatPlan(status.planKey, language), inline: true },
                { name: t(language, 'premiumSource'), value: formatSource(status.source, language), inline: true },
                { name: t(language, 'premiumExpires'), value: formatExpiry(status.expiresAt, language), inline: true },
            );
        } else {
            embed.setDescription(
                t(language, 'premiumInactiveBody')
            );
            if (status.status === 'expired' && status.expiresAt) {
                embed.addFields({
                    name: t(language, 'premiumPreviousAccess'),
                    value: t(language, 'premiumExpired', { time: formatTimestamp(status.expiresAt, 'R') }),
                });
            }
        }

        return interaction.editReply({
            embeds: [embed],
            components: [buildLinks(language)],
        });
    },
};

function buildPerksEmbed(language = 'en') {
    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('\u2b50 PomoBot Premium')
        .setDescription(t(language, 'premiumPerksIntro'))
        .addFields(
            {
                name: `\uD83C\uDF81 ${t(language, 'premiumPerksWhatYouGet')}`,
                value: t(language, 'premiumPerksItems'),
            },
            {
                name: `\uD83D\uDCB3 ${t(language, 'premiumPerksHowTo')}`,
                value: t(language, 'premiumPerksHowToBody'),
            },
            {
                name: `\uD83D\uDCAA ${t(language, 'premiumPerksFairPlayTitle')}`,
                value: t(language, 'premiumPerksFairPlayBody'),
            },
        )
        .setFooter({ text: t(language, 'premiumPerksFooter') })
        .setTimestamp();
}

function buildLinks(language = 'en') {
    const hasDonationUrl = DONATION_URL.trim().length > 0;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(t(language, 'premiumButtonMember'))
            .setStyle(ButtonStyle.Link)
            .setURL(hasDonationUrl ? DONATION_URL : WEBSITE_SUPPORT_URL),
        new ButtonBuilder()
            .setLabel(t(language, 'premiumButtonSupport'))
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_SERVER_URL),
        new ButtonBuilder()
            .setLabel(t(language, 'premiumButtonWebsite'))
            .setStyle(ButtonStyle.Link)
            .setURL(WEBSITE_SUPPORT_URL),
    );
}

function formatPlan(planKey, language = 'en') {
    if (planKey === 'pro_beta') return t(language, 'premiumPlanProBeta');
    if (planKey === 'supporter') return t(language, 'premiumPlanSupporter');
    if (planKey === 'legacy') return t(language, 'premiumPlanLegacy');
    return planKey || t(language, 'premiumTitle');
}

function formatSource(source, language = 'en') {
    const sources = {
        manual_beta: t(language, 'premiumSourceManualBeta'),
        discord_role: t(language, 'premiumSourceDiscordRole'),
        buymeacoffee_role: t(language, 'premiumSourceBuyMeCoffee'),
        legacy_override: t(language, 'premiumSourceLegacy'),
        boosty: 'Boosty',
        boosty_manual: 'Boosty',
        campaign: t(language, 'premiumSourceCampaign'),
        manual: t(language, 'premiumSourceManual'),
    };
    return sources[source] || source || t(language, 'premiumUnknown');
}

function formatExpiry(value, language = 'en') {
    return value ? formatTimestamp(value, 'F') : t(language, 'premiumNoExpiration');
}

function formatTimestamp(value, style) {
    const timestamp = Math.floor(new Date(`${value.replace(' ', 'T')}Z`).getTime() / 1000);
    return `<t:${timestamp}:${style}>`;
}

module.exports.buildPerksEmbed = buildPerksEmbed;
module.exports.formatTimestamp = formatTimestamp;

// ─── /premium activate ────────────────────────────────────────────────────────
async function handleActivate(interaction, language = getInteractionLanguage(interaction)) {
    const userId = interaction.user.id;

    if (isProActive(userId)) {
        return interaction.reply({
            content: t(language, 'premiumActivateAlreadyActive'),
            flags: 64
        });
    }

    const existing = db.prepare(
        `SELECT submitted_at FROM pro_verification_queue WHERE discord_id = ? AND status = 'PENDING'`
    ).get(userId);

    if (existing) {
        return interaction.reply({
            content: t(language, 'premiumActivatePending', {
                time: `<t:${Math.floor(new Date(existing.submitted_at).getTime() / 1000)}:R>`,
            }),
            flags: 64
        });
    }

    const modal = new ModalBuilder()
        .setCustomId('pro_verification_modal')
        .setTitle(t(language, 'premiumActivateModalTitle'));

    const boostyInput = new TextInputBuilder()
        .setCustomId('boosty_identifier')
        .setLabel(t(language, 'premiumActivateEmailLabel'))
        .setPlaceholder(t(language, 'premiumActivateEmailPlaceholder'))
        .setStyle(TextInputStyle.Short)
        .setMinLength(3)
        .setMaxLength(100)
        .setRequired(true);

    const noteInput = new TextInputBuilder()
        .setCustomId('user_note')
        .setLabel(t(language, 'premiumActivateNoteLabel'))
        .setPlaceholder(t(language, 'premiumActivateNotePlaceholder'))
        .setStyle(TextInputStyle.Short)
        .setMaxLength(200)
        .setRequired(false);

    const { ActionRowBuilder } = require('discord.js');
    modal.addComponents(
        new ActionRowBuilder().addComponents(boostyInput),
        new ActionRowBuilder().addComponents(noteInput)
    );

    await interaction.showModal(modal);
}
