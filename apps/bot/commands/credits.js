/**
 * /credits - Show the people behind PomoBot.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Colors } = require('../utils/constants');
const { getBotInviteUrl } = require('../utils/invite');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('credits')
        .setDescription('Meet the team behind PomoBot 🍅'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const embed = new EmbedBuilder()
            .setColor(Colors.PRIMARY)
            .setTitle(`🍅 ${t(language, 'creditsTitle')}`)
            .setDescription(t(language, 'creditsBody'))
            .addFields(
                {
                    name: `👑 ${t(language, 'creditsCreatorTitle')}`,
                    value: t(language, 'creditsCreatorBody'),
                    inline: false,
                },
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: false,
                },
                {
                    name: `🎨 ${t(language, 'creditsArtistTitle')}`,
                    value: t(language, 'creditsArtistBody'),
                    inline: false,
                },
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: false,
                },
                {
                    name: `💙 ${t(language, 'creditsSupportersTitle')}`,
                    value: t(language, 'creditsSupportersBody'),
                    inline: false,
                },
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: false,
                },
                {
                    name: '⚡ Sponsored by',
                    value: '**[AzeDev](https://azedev.com/links)** — Providing the VDS server that keeps PomoBot running 24/7. Azerbaijan Developer Community 🇦🇿',
                    inline: false,
                },
            )
            .setFooter({ text: t(language, 'creditsFooter') })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(t(language, 'creditsInviteButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(getBotInviteUrl())
                .setEmoji('🤖'),
            new ButtonBuilder()
                .setLabel('Pomo Web')
                .setStyle(ButtonStyle.Link)
                .setURL('https://pomofocus.online')
                .setEmoji('🌐'),
            new ButtonBuilder()
                .setLabel('AzeDev')
                .setStyle(ButtonStyle.Link)
                .setURL('https://azedev.com/links')
                .setEmoji('⚡'),
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};
