const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    configurePersonalGoal,
    getOrCreateCurrentPersonalGoal,
    getPersonalGoalStats,
    disablePersonalGoal,
} = require('../utils/database');
const { hasFullPro } = require('../utils/premiumCheck');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed, progressBar, formatTime } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('mygoal')
        .setDescription('Manage your Pomo Pro personal focus goal')
        .addSubcommand(option =>
            option.setName('setup')
                .setDescription('Create a recurring weekly or monthly focus goal')
                .addStringOption(input =>
                    input.setName('period')
                        .setDescription('How often the goal resets')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Weekly', value: 'weekly' },
                            { name: 'Monthly', value: 'monthly' },
                        ))
                .addIntegerOption(input =>
                    input.setName('minutes')
                        .setDescription('Focus target in minutes')
                        .setRequired(true)
                        .setMinValue(60)
                        .setMaxValue(20000)))
        .addSubcommand(option =>
            option.setName('status')
                .setDescription('View your current personal goal progress'))
        .addSubcommand(option =>
            option.setName('disable')
                .setDescription('Stop your recurring personal goal')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        // Pro only (not in Plus)
        const premium = await hasFullPro(interaction.client, interaction.user.id);
        if (!premium) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'proFeatureTitle'),
                    t(language, 'myGoalLockedBody')
                )],
                flags: 64,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'setup') return handleSetup(interaction, language);
        if (subcommand === 'disable') return handleDisable(interaction, language);
        return handleStatus(interaction, language);
    },
};

async function handleSetup(interaction, language = getInteractionLanguage(interaction)) {
    const period = interaction.options.getString('period', true);
    const minutes = interaction.options.getInteger('minutes', true);
    const goal = configurePersonalGoal(interaction.user.id, period, minutes);
    const label = period === 'monthly' ? t(language, 'monthlyLabel') : t(language, 'weeklyLabel');

    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'myGoalEnabledTitle', { period: label }),
            t(language, 'myGoalEnabledBody', {
                target: formatTime(goal.target_minutes),
                start: goal.period_start,
                end: goal.period_end,
            })
        )],
        flags: 64,
    });
}

async function handleStatus(interaction, language = getInteractionLanguage(interaction)) {
    const goal = getOrCreateCurrentPersonalGoal(interaction.user.id);
    if (!goal) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'noPersonalGoalTitle'),
                t(language, 'noPersonalGoalBody')
            )],
            flags: 64,
        });
    }

    const stats = getPersonalGoalStats(goal.id);
    const remaining = Math.max(0, goal.target_minutes - stats.total_minutes);
    const label = goal.period_type === 'monthly' ? t(language, 'monthlyLabel') : t(language, 'weeklyLabel');
    const completeText = goal.status === 'completed'
        ? `\n\n**${t(language, 'goalCompleteNextPeriod')}**`
        : `\n${t(language, 'remainingLabel')}: **${formatTime(remaining)}**`;

    const embed = new EmbedBuilder()
        .setColor(goal.status === 'completed' ? Colors.SUCCESS : Colors.STUDY)
        .setTitle(t(language, 'personalGoalTitle', { period: label }))
        .setDescription(
            `${progressBar(stats.total_minutes, goal.target_minutes, 16)}\n\n` +
            `${t(language, 'progressLabel')}: **${formatTime(stats.total_minutes)} / ${formatTime(goal.target_minutes)}**\n` +
            `${t(language, 'completedSessionsLabel')}: **${stats.sessions}**` +
            completeText
        )
        .setFooter({ text: `${goal.period_start} to ${goal.period_end} (UTC)` })
        .setTimestamp();

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleDisable(interaction, language = getInteractionLanguage(interaction)) {
    disablePersonalGoal(interaction.user.id);
    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'personalGoalDisabledTitle'),
            t(language, 'personalGoalDisabledBody')
        )],
        flags: 64,
    });
}
