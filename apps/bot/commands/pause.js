const { SlashCommandBuilder } = require('discord.js');
const { getActiveSessionForUser } = require('../utils/database');
const { pauseStudySession } = require('../utils/timerManager');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause your active solo study session'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const session = getActiveSessionForUser(interaction.user.id);

        if (!session) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'noActiveSessionTitle'), t(language, 'noActiveSessionBody'))],
                flags: 64,
            });
        }

        const result = await pauseStudySession(interaction.client, session);
        if (!result.ok) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, pauseErrorTitleKey(result.reason)), t(language, pauseErrorBodyKey(result.reason)))],
                flags: 64,
            });
        }

        return interaction.reply({
            embeds: [successEmbed(
                t(language, 'sessionPausedTitle'),
                t(language, 'sessionPausedBody', { minutes: 15 })
            )],
            flags: 64,
        });
    },
};

function pauseErrorTitleKey(reason) {
    if (reason === 'break' || reason === 'pomodoro') return 'pauseUnsupportedTitle';
    return 'sessionPauseErrorTitle';
}

function pauseErrorBodyKey(reason) {
    const map = {
        break: 'pauseBreakUnsupportedBody',
        pomodoro: 'pausePomodoroUnsupportedBody',
        already_paused: 'alreadyPausedBody',
        limit: 'pauseLimitReachedBody',
        not_found: 'noActiveSessionBody',
    };
    return map[reason] || 'sessionPauseErrorBody';
}
