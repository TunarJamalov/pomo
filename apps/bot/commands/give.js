/**
 * /give [user] [amount] - Owner-only command to give water to a user.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { getOrCreateUser, incrementUser } = require('../utils/database');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    ownerOnly: true,
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give water to a user (Owner only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give water to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of water to give')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100000)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'unauthorizedTitle'), t(language, 'ownerOnlyCommandBody'))],
                flags: 64,
            });
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        getOrCreateUser(targetUser.id);
        incrementUser(targetUser.id, 'water', amount);

        const updatedUser = getOrCreateUser(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(t(language, 'waterGrantedTitle'))
            .setDescription(t(language, 'waterGrantedBody', {
                amount,
                user: targetUser,
                balance: updatedUser.water,
            }))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
