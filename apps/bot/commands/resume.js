const { SlashCommandBuilder } = require('discord.js');
const { getActiveSessionForUser } = require('../utils/database');
const { resumeStudySession } = require('../utils/timerManager');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume your paused solo study session'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const session = getActiveSessionForUser(interaction.user.id);

        if (!session) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'noActiveSessionTitle'), t(language, 'noActiveSessionBody'))],
                flags: 64,
            });
        }

        const result = await resumeStudySession(interaction.client, session);
        if (!result.ok) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, resumeErrorTitleKey(result.reason)), t(language, resumeErrorBodyKey(result.reason)))],
                flags: 64,
            });
        }

        return interaction.reply({
            embeds: [successEmbed(t(language, 'sessionResumedTitle'), t(language, 'sessionResumedBody'))],
            flags: 64,
        });
    },
};

function resumeErrorTitleKey(reason) {
    if (reason === 'break' || reason === 'pomodoro') return 'pauseUnsupportedTitle';
    if (reason === 'timeout') return 'sessionAutoCancelledTitle';
    return 'sessionPauseErrorTitle';
}

function resumeErrorBodyKey(reason) {
    const map = {
        break: 'pauseBreakUnsupportedBody',
        pomodoro: 'pausePomodoroUnsupportedBody',
        not_paused: 'notPausedBody',
        timeout: 'pauseTimeoutCancelledBody',
        not_found: 'noActiveSessionBody',
    };
    return map[reason] || 'sessionPauseErrorBody';
}
