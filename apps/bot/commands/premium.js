const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors, SUPPORT_SERVER_URL } = require('../utils/constants');
const { getPremiumStatus } = require('../utils/premiumCheck');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { buyButtons, manageUrl, PRICING_PAGE, PLANS } = require('../utils/billing');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('premium')
        .setDescription('Get Pomo Plus or Pro, or see your plan and perks')
        .addSubcommand(option =>
            option.setName('status')
                .setDescription('View your Pomo plan and manage your subscription'))
        .addSubcommand(option =>
            option.setName('perks')
                .setDescription('Compare Pomo Plus and Pro and get one')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        await interaction.deferReply({ flags: 64 });
        const status = await getPremiumStatus(interaction.client, userId);

        if (interaction.options.getSubcommand() === 'perks') {
            return interaction.editReply({
                embeds: [buildPerksEmbed(language)],
                components: [buildActionRow(language, userId, status.active)],
            });
        }

        const embed = new EmbedBuilder()
            .setColor(status.active ? Colors.MARKET : Colors.INFO)
            .setTitle(status.active ? t(language, 'premiumActiveTitle') : t(language, 'premiumTitle'))
            .setTimestamp();

        if (status.active) {
            embed.setDescription(t(language, 'premiumActiveBody')).addFields(
                { name: t(language, 'premiumPlan'), value: formatPlan(status.planKey, language), inline: true },
                { name: t(language, 'premiumSource'), value: formatSource(status.source, language), inline: true },
                { name: t(language, 'premiumExpires'), value: formatExpiry(status.expiresAt, language), inline: true },
            );
        } else {
            embed.setDescription(t(language, 'premiumInactiveBody'));
            if (status.status === 'expired' && status.expiresAt) {
                embed.addFields({
                    name: t(language, 'premiumPreviousAccess'),
                    value: t(language, 'premiumExpired', { time: formatTimestamp(status.expiresAt, 'R') }),
                });
            }
        }

        return interaction.editReply({ embeds: [embed], components: [buildActionRow(language, userId, status.active)] });
    },
};

/** Buy buttons for non-Pro users; manage + support links for Pro users. */
function buildActionRow(language, userId, isActive) {
    const row = new ActionRowBuilder();
    if (isActive) {
        const portal = manageUrl(userId);
        if (portal) {
            row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'proManageButton')).setEmoji('⚙️').setURL(portal));
        }
    } else {
        row.addComponents(...buyButtons(language, userId));
    }
    row.addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'premiumButtonSupport')).setURL(SUPPORT_SERVER_URL),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'premiumButtonWebsite')).setURL(PRICING_PAGE),
    );
    return row;
}

function buildPerksEmbed(language = 'en') {
    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⭐ Pomo Plus · 🚀 Pomo Pro')
        .setDescription(t(language, 'premiumPerksIntro'))
        .addFields(
            {
                name: t(language, 'planPlusTitle', { monthly: PLANS.plus.monthly, yearly: PLANS.plus.yearly }),
                value: t(language, 'planPlusItems'),
            },
            {
                name: t(language, 'planProTitle', { monthly: PLANS.pro.monthly, yearly: PLANS.pro.yearly }),
                value: t(language, 'planProItems'),
            },
            {
                name: `💳 ${t(language, 'premiumPerksHowTo')}`,
                value: t(language, 'premiumPerksHowToBody'),
            },
            {
                name: `💪 ${t(language, 'premiumPerksFairPlayTitle')}`,
                value: t(language, 'premiumPerksFairPlayBody'),
            },
        )
        .setFooter({ text: t(language, 'premiumPerksFooter') })
        .setTimestamp();
}

function formatPlan(planKey, language = 'en') {
    if (planKey === 'plus') return t(language, 'planNamePlus');
    if (planKey === 'pro') return t(language, 'planNamePro');
    if (planKey === 'pro_beta') return t(language, 'premiumPlanProBeta');
    if (planKey === 'supporter') return t(language, 'premiumPlanSupporter');
    if (planKey === 'legacy') return t(language, 'premiumPlanLegacy');
    return planKey || t(language, 'premiumTitle');
}

function formatSource(source, language = 'en') {
    const sources = {
        paddle: t(language, 'proSourcePaid'),
        epoint: t(language, 'proSourcePaid'),
        lemonsqueezy: t(language, 'proSourcePaid'),
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
