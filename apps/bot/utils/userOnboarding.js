const { EmbedBuilder } = require('discord.js');
const { Colors } = require('./constants');
const { markOnboardingTipShown } = require('./database');
const { getInteractionLanguage, t } = require('./i18n');

const ONBOARDING_TIPS = {
    study: {
        titleKey: 'onboardingStudyTitle',
        bodyKey: 'onboardingStudyBody',
    },
    pomodoro: {
        titleKey: 'onboardingPomodoroTitle',
        bodyKey: 'onboardingPomodoroBody',
    },
    team: {
        titleKey: 'onboardingTeamTitle',
        bodyKey: 'onboardingTeamBody',
    },
    garden: {
        titleKey: 'onboardingGardenTitle',
        bodyKey: 'onboardingGardenBody',
    },
    daily: {
        titleKey: 'onboardingDailyTitle',
        bodyKey: 'onboardingDailyBody',
    },
    profile: {
        titleKey: 'onboardingProfileTitle',
        bodyKey: 'onboardingProfileBody',
    },
    quests: {
        titleKey: 'onboardingQuestsTitle',
        bodyKey: 'onboardingQuestsBody',
    },
    voice: {
        titleKey: 'onboardingVoiceTitle',
        bodyKey: 'onboardingVoiceBody',
    },
};

const ELIGIBLE_COMMANDS = new Set(Object.keys(ONBOARDING_TIPS));

async function maybeSendUserOnboardingTip(interaction) {
    if (!interaction?.isChatInputCommand?.()) return false;
    if (!ELIGIBLE_COMMANDS.has(interaction.commandName)) return false;
    if (interaction.user?.bot) return false;

    const tipKey = `command:${interaction.commandName}`;
    if (!markOnboardingTipShown(interaction.user.id, tipKey)) return false;

    const language = getInteractionLanguage(interaction);
    const tip = ONBOARDING_TIPS[interaction.commandName];
    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, tip.titleKey))
        .setDescription(t(language, tip.bodyKey))
        .setFooter({ text: t(language, 'onboardingFooter') });

    const payload = { embeds: [embed], flags: 64 };
    if (interaction.replied || interaction.deferred) {
        return Boolean(await interaction.followUp(payload).catch(() => null));
    }

    return Boolean(await interaction.reply(payload).catch(() => null));
}

module.exports = {
    ONBOARDING_TIPS,
    maybeSendUserOnboardingTip,
};
