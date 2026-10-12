const { SlashCommandBuilder } = require('discord.js');
const { hasActiveSession } = require('../utils/timerManager');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { transactionManager, sessionRepository, teamSessionRepository } = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cancel')
        .setDescription('Cancel your active solo or team study session'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;

        const result = await transactionManager.execute(async ctx => {
            // 1. Check for Solo Session
            const soloSession = await sessionRepository.getActiveSession(ctx, userId);
            if (soloSession) {
                sessionRepository.cancelSession(ctx, soloSession.id);
                return { type: 'solo', session: soloSession };
            }

            // 2. Check for Team Session where the user is HOST
            const teamSession = teamSessionRepository.getActiveOrWaitingSessionByHost(ctx, userId);
            if (teamSession) {
                teamSessionRepository.cancelSession(ctx, teamSession.id);
                return { type: 'team', session: teamSession };
            }

            return null;
        });

        if (result && result.type === 'solo') {
            const session = result.session;
            const { clearTimers } = require('../utils/timerManager');
            // Just clears the in-memory timers, db deletion already done
            clearTimers(session.id); 

            // Update the original timer message so it shows "Cancelled" instead of freezing
            try {
                const { EmbedBuilder } = require('discord.js');
                const channel = await interaction.client.channels.fetch(session.channel_id).catch(() => null);
                if (channel && session.message_id) {
                    const msg = await channel.messages.fetch(session.message_id).catch(() => null);
                    if (msg) {
                        const { Colors } = require('../utils/constants');
                        const cancelEmbed = new EmbedBuilder()
                            .setColor(Colors.WARNING)
                            .setTitle(`⏹️ ${t(language, 'cancelSessionTitle')}`)
                            .setDescription(t(language, 'cancelSessionMessageBody'))
                            .setTimestamp();
                        await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
                    }
                }
            } catch (_) {}

            return interaction.reply({
                embeds: [successEmbed(t(language, 'cancelSessionTitle'), t(language, 'cancelSessionBody'))],
                flags: 64
            });
        }

        if (result && result.type === 'team') {
            const teamSession = result.session;
            // Clean up the in-memory activeTeamSessions map from team.js
            try {
                const teamModule = require('./team');
                if (typeof teamModule.cleanupTeamSession === 'function') {
                    teamModule.cleanupTeamSession(teamSession.id);
                }
            } catch (_) {}

            // Update the lobby message so it doesn't sit there frozen
            try {
                const { EmbedBuilder } = require('discord.js');
                const { Colors } = require('../utils/constants');
                const channel = await interaction.client.channels.fetch(teamSession.channel_id).catch(() => null);
                if (channel && teamSession.message_id) {
                    const msg = await channel.messages.fetch(teamSession.message_id).catch(() => null);
                    if (msg) {
                        const cancelEmbed = new EmbedBuilder()
                            .setColor(Colors.WARNING)
                            .setTitle(`⏹️ ${t(language, 'cancelTeamTitle')}`)
                            .setDescription(t(language, 'cancelTeamMessageBody'))
                            .setTimestamp();
                        await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
                    }
                }
            } catch (_) {}

            return interaction.reply({
                embeds: [successEmbed(t(language, 'cancelTeamTitle'), t(language, 'cancelTeamBody'))],
                flags: 64
            });
        }

        return interaction.reply({
            embeds: [errorEmbed(t(language, 'noActiveSessionTitle'), t(language, 'noActiveSessionBody'))],
            flags: 64
        });
    }
};
