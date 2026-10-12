/**
 * /unmatch — End your current PomoMatch study partnership.
 * Shared core logic lives in findbuddy.js (doUnmatch).
 */

const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage } = require('../utils/i18n');
const { getOrCreateUser } = require('../utils/database');
const { doUnmatch, checkUnmatchRateLimit } = require('./findbuddy');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('unmatch')
        .setDescription('End your current PomoMatch study partnership'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);

        await interaction.deferReply({ flags: 64 });

        if (!checkUnmatchRateLimit(userId)) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    'Slow Down',
                    'You are doing that too often. Please wait a bit before trying again.'
                )],
            });
        }

        const res = await doUnmatch(interaction.client, userId, null);
        if (!res.ok) {
            return interaction.editReply({
                embeds: [errorEmbed('No Active Match', 'You have no active match to end.')],
            });
        }

        return interaction.editReply({
            embeds: [successEmbed(
                'Match Ended',
                'Your study partnership has ended. You won\'t be matched with each other again.'
            )],
        });
    },
};
