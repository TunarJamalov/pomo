const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const {
    Colors,
    ProProfileAccents,
    ProProfileBadges,
    SessionCardThemes,
} = require('../utils/constants');
const {
    getOrCreateProProfileSettings,
    updateProProfileSettings,
    setCardTheme,
} = require('../utils/database');
const { isPremium, hasFullPro } = require('../utils/premiumCheck');
const { generateSessionEndCard } = require('../utils/canvas');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const accentChoices = Object.entries(ProProfileAccents).map(([value, item]) => ({
    name: item.name,
    value,
}));
const themeChoices = Object.entries(SessionCardThemes).map(([value, item]) => ({
    name: item.name,
    value,
}));
const badgeChoices = Object.entries(ProProfileBadges).map(([value, item]) => ({
    name: item.name,
    value,
}));

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('proprofile')
        .setDescription('Customize your Pomo Pro profile card')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your current Pro profile style'))
        .addSubcommand(sub =>
            sub.setName('accent')
                .setDescription('Choose the accent color used on your profile card')
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('Profile accent color')
                        .setRequired(true)
                        .addChoices(...accentChoices)))
        .addSubcommand(sub =>
            sub.setName('badge')
                .setDescription('Choose the badge shown on your profile card')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Profile badge')
                        .setRequired(true)
                        .addChoices(...badgeChoices)))
        .addSubcommand(sub =>
            sub.setName('cardtheme')
                .setDescription('Choose the look of your session complete card (Pomo Pro)')
                .addStringOption(option =>
                    option.setName('theme')
                        .setDescription('Card theme')
                        .setRequired(true)
                        .addChoices(...themeChoices)))
        .addSubcommand(sub =>
            sub.setName('reset')
                .setDescription('Reset your Pro profile style')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        if (!await isPremium(interaction.client, interaction.user.id)) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'proFeatureTitle'),
                    t(language, 'proProfileLockedBody')
                )],
                flags: 64,
            });
        }

        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'view') {
            const settings = getOrCreateProProfileSettings(userId);
            return interaction.reply({
                embeds: [buildSettingsEmbed(settings, language)],
                flags: 64,
            });
        }

        if (subcommand === 'accent') {
            const accentKey = interaction.options.getString('color');
            if (!ProProfileAccents[accentKey]) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'invalidAccentTitle'), t(language, 'invalidAccentBody'))],
                    flags: 64,
                });
            }
            updateProProfileSettings(userId, { accentKey });
            return interaction.reply({
                embeds: [successEmbed(
                    t(language, 'profileAccentUpdatedTitle'),
                    t(language, 'profileAccentUpdatedBody', { accent: ProProfileAccents[accentKey].name })
                )],
                flags: 64,
            });
        }

        if (subcommand === 'cardtheme') {
            return setTheme(interaction, userId, language);
        }

        if (subcommand === 'badge') {
            const badgeKey = interaction.options.getString('name');
            if (!ProProfileBadges[badgeKey]) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'invalidBadgeTitle'), t(language, 'invalidBadgeBody'))],
                    flags: 64,
                });
            }
            updateProProfileSettings(userId, { badgeKey });
            return interaction.reply({
                embeds: [successEmbed(
                    t(language, 'profileBadgeUpdatedTitle'),
                    t(language, 'profileBadgeUpdatedBody', { badge: ProProfileBadges[badgeKey].name })
                )],
                flags: 64,
            });
        }

        const settings = updateProProfileSettings(userId, {
            accentKey: 'gold',
            badgeKey: 'pomo_pro',
        });
        return interaction.reply({
            embeds: [successEmbed(
                t(language, 'proProfileResetTitle'),
                t(language, 'proProfileResetBody', {
                    accent: ProProfileAccents[settings.accent_key].name,
                    badge: ProProfileBadges[settings.badge_key].name,
                })
            )],
            flags: 64,
        });
    },
};

function buildSettingsEmbed(settings, language = 'en') {
    const accent = ProProfileAccents[settings.accent_key] || ProProfileAccents.gold;
    const badge = ProProfileBadges[settings.badge_key] || ProProfileBadges.pomo_pro;

    return new EmbedBuilder()
        .setColor(accent.color || Colors.PROFILE)
        .setTitle(t(language, 'proProfileTitle'))
        .addFields(
            { name: t(language, 'accentLabel'), value: accent.name, inline: true },
            { name: t(language, 'badgeLabel'), value: badge.name, inline: true },
            { name: t(language, 'cardThemeLabel'), value: (SessionCardThemes[settings.card_theme] || SessionCardThemes.classic).name, inline: true },
        )
        .setDescription(t(language, 'proProfileHelpBody'))
        .setTimestamp();
}

/** Pro only (not in Plus): save the theme and show a preview card. */
async function setTheme(interaction, userId, language) {
    const themeKey = interaction.options.getString('theme');
    await interaction.deferReply({ flags: 64 });
    if (!await hasFullPro(interaction.client, userId)) {
        return interaction.editReply({ embeds: [errorEmbed(t(language, 'proFeatureTitle'), t(language, 'cardThemeProOnly'))] });
    }
    setCardTheme(userId, themeKey);

    const embed = successEmbed(
        t(language, 'cardThemeUpdatedTitle'),
        t(language, 'cardThemeUpdatedBody', { theme: SessionCardThemes[themeKey].name })
    );
    try {
        const preview = await generateSessionEndCard({
            username: interaction.user.displayName || interaction.user.username,
            avatar: interaction.user.displayAvatarURL({ extension: 'png', size: 128 }),
            duration: 25,
            waterAwarded: 2,
            xpAwarded: 30,
            streak: 7,
            title: 'Study Session',
            leveledUp: false,
            language,
            theme: themeKey,
        });
        embed.setImage('attachment://card-preview.png');
        return interaction.editReply({ embeds: [embed], files: [new AttachmentBuilder(preview, { name: 'card-preview.png' })] });
    } catch (err) {
        console.error('[PROPROFILE] Card preview failed:', err.message);
        return interaction.editReply({ embeds: [embed] });
    }
}

module.exports.buildSettingsEmbed = buildSettingsEmbed;
