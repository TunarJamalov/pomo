const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { db } = require('../utils/database');
const { cancelSession } = require('../utils/timerManager');
const { cleanupTeamSession } = require('./team');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    ownerOnly: true,
    data: new SlashCommandBuilder()
        .setName('cancelall')
        .setDescription('[ADMIN] Force-cancel all active focus and team sessions.'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: t(language, 'ownerOnlyCommandBody'), flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        let individualCount = 0;
        let teamCount = 0;

        const cancelEmbed = new EmbedBuilder()
            .setColor(Colors.WARNING)
            .setTitle(t(language, 'sessionCancelledTitle'))
            .setDescription(t(language, 'sessionForceCancelledBody'))
            .setTimestamp();

        const activeSessions = db.prepare("SELECT id, channel_id, message_id FROM study_sessions WHERE completed = 0").all();
        for (const session of activeSessions) {
            try {
                if (session.channel_id && session.message_id) {
                    const channel = await interaction.client.channels.fetch(session.channel_id).catch(() => null);
                    if (channel) {
                        const msg = await channel.messages.fetch(session.message_id).catch(() => null);
                        if (msg) await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => null);
                    }
                }
            } catch (_) {}

            cancelSession(session.id);
            individualCount++;
        }

        const activeTeamSessions = db.prepare("SELECT id, channel_id, message_id FROM team_sessions WHERE status IN ('waiting', 'active', 'break')").all();
        for (const team of activeTeamSessions) {
            try {
                if (team.channel_id && team.message_id) {
                    const channel = await interaction.client.channels.fetch(team.channel_id).catch(() => null);
                    if (channel) {
                        const msg = await channel.messages.fetch(team.message_id).catch(() => null);
                        if (msg) await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => null);
                    }
                }
            } catch (_) {}

            cleanupTeamSession(team.id);
            db.prepare("UPDATE team_sessions SET status = 'cancelled' WHERE id = ?").run(team.id);
            teamCount++;
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(t(language, 'allSessionsCancelledTitle'))
            .setDescription(t(language, 'allSessionsCancelledBody', {
                individual: individualCount,
                team: teamCount,
            }))
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
