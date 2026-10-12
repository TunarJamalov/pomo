/**
 * /break [minutes] - Start a break timer (no rewards).
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, progressBar, formatTime } = require('../utils/embeds');
const { getOrCreateUser, createSession, getActiveSessionForUser, isUserInAnyActiveSession, db } = require('../utils/database');
const { startBreakTimer } = require('../utils/timerManager');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('break')
        .setDescription('Start a break timer (no rewards)')
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Break duration in minutes (1-30)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(30)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const minutes = interaction.options.getInteger('minutes');
        const userId = interaction.user.id;

        getOrCreateUser(userId);

        if (isUserInAnyActiveSession(userId)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'activeSessionBody'))],
                flags: 64,
            });
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`☕ ${t(language, 'breakTimeTitle')}`)
            .setDescription(
                `**${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
                `**${t(language, 'elapsedLabel')}:** 0m\n` +
                `**${t(language, 'remainingLabel')}:** ${formatTime(minutes)}\n\n` +
                `${progressBar(0, minutes, 20)}`
            )
            .setFooter({ text: t(language, 'breakTimeFooter') })
            .setTimestamp();

        const sessionId = createSession(
            userId,
            interaction.guildId,
            interaction.channelId,
            null,
            minutes,
            '__break__'
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`cancel_break_${sessionId}`)
                .setLabel(t(language, 'cancelBreakButton'))
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⏹️')
        );

        const reply = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });

        const messageId = reply?.resource?.message?.id;
        if (messageId) {
            db.prepare('UPDATE study_sessions SET message_id = ? WHERE id = ?').run(messageId, sessionId);
        }

        const session = getActiveSessionForUser(userId);
        startBreakTimer(interaction.client, session);
    },
};
