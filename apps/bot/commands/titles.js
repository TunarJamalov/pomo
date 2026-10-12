const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Titles } = require('../utils/constants');
const {
    getOrCreateUser,
    getUserTitles,
    setActiveTitle,
} = require('../utils/database');
const { errorEmbed, successEmbed } = require('../utils/embeds');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('titles')
        .setDescription('View and equip your unlocked profile titles')
        .addSubcommand(subcommand => subcommand
            .setName('view')
            .setDescription('View your unlocked titles'))
        .addSubcommand(subcommand => subcommand
            .setName('equip')
            .setDescription('Equip an unlocked title')
            .addStringOption(option => option
                .setName('title')
                .setDescription('Title to equip')
                .setRequired(true)
                .addChoices(...Object.values(Titles).map(title => ({
                    name: title.name,
                    value: title.key,
                })))))
        .addSubcommand(subcommand => subcommand
            .setName('clear')
            .setDescription('Remove your active title')),

    async execute(interaction) {
        const userId = interaction.user.id;
        getOrCreateUser(userId);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'equip') {
            const titleKey = interaction.options.getString('title', true);
            const result = setActiveTitle(userId, titleKey);
            if (!result.success) {
                return interaction.reply({
                    embeds: [errorEmbed('Title Locked', 'Unlock this title before equipping it.')],
                    flags: 64,
                });
            }
            return interaction.reply({
                embeds: [successEmbed(
                    '🏷️ Title Equipped',
                    `${result.title.emoji} You are now **${result.title.name}**.`,
                )],
            });
        }

        if (subcommand === 'clear') {
            setActiveTitle(userId, null);
            return interaction.reply({
                embeds: [successEmbed('🏷️ Title Removed', 'Your profile no longer displays an active title.')],
                flags: 64,
            });
        }

        const titles = getUserTitles(userId);
        const description = titles.length
            ? titles.map(title => `${title.active ? '✅' : '▫️'} ${title.emoji} **${title.name}** — ${title.description}`).join('\n')
            : 'No titles unlocked yet. Complete achievements and seasonal goals to earn one.';
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.PROFILE)
                .setTitle('🏷️ Your Titles')
                .setDescription(description)
                .setFooter({ text: 'Use /titles equip to display a title on your profile.' })
                .setTimestamp()],
        });
    },
};
