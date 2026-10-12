const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('../utils/constants');
const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
const { SupportedLanguages, languageLabel, normalizeLanguage, t } = require('../utils/i18n');
const { errorEmbed, successEmbed } = require('../utils/embeds');

const languageChoices = Object.entries(SupportedLanguages).map(([value, info]) => ({
    name: `${info.flag} ${info.label}`,
    value,
}));

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('language')
        .setDescription('View or change this server language')
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('View the current server language'))
        .addSubcommand(sub => sub
            .setName('set')
            .setDescription('Change the server language')
            .addStringOption(option => option
                .setName('language')
                .setDescription('Language to use for supported server messages')
                .setRequired(true)
                .addChoices(...languageChoices)))
        .addSubcommand(sub => sub
            .setName('list')
            .setDescription('List available languages')),

    async execute(interaction) {
        const settings = getOrCreateGuildSettings(interaction.guildId);
        const language = normalizeLanguage(settings.language || interaction.guildLocale || 'en');
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            return handleSet(interaction, language);
        }
        if (subcommand === 'list') {
            return handleList(interaction, language);
        }
        return handleView(interaction, language);
    },
};

async function handleView(interaction, language) {
    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'languageTitle'))
        .setDescription(t(language, 'languageCurrent', { language: languageLabel(language) }))
        .setFooter({ text: t(language, 'languageNote') })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleList(interaction, language) {
    const list = Object.entries(SupportedLanguages)
        .map(([code, info]) => `${info.flag} **${info.native}** \`${code}\``)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'languageList'))
        .setDescription(list)
        .setFooter({ text: t(language, 'languageNote') })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleSet(interaction, currentLanguage) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
            embeds: [errorEmbed('Missing Permission', 'You need the **Manage Server** permission to change this server language.')],
            flags: 64,
        });
    }

    const requested = interaction.options.getString('language');
    const language = normalizeLanguage(requested);
    if (language !== requested) {
        return interaction.reply({
            embeds: [errorEmbed(t(currentLanguage, 'languageTitle'), t(currentLanguage, 'languageUnsupported'))],
            flags: 64,
        });
    }

    updateGuildSettings(interaction.guildId, { language });

    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'languageUpdated'),
            t(language, 'languageUpdatedBody', { language: languageLabel(language) })
        )],
        flags: 64,
    });
}
