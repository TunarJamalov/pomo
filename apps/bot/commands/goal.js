const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
} = require('discord.js');
const {
    configureGuildGoal,
    getOrCreateCurrentGuildGoal,
    getGuildGoalStats,
    getGuildGoalContributors,
    getGuildGoalContribution,
    disableGuildGoal,
    claimGuildGoalReward,
    getOrCreateGuildSettings,
    getOrCreateUser,
    updateUser,
} = require('../utils/database');
const { Colors, xpForLevel, Plants } = require('../utils/constants');
const { errorEmbed, successEmbed, progressBar, formatTime } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const TARGET_CHOICES = [
    { name: '500 minutes', value: 500 },
    { name: '1,000 minutes', value: 1000 },
    { name: '2,500 minutes', value: 2500 },
    { name: '5,000 minutes', value: 5000 },
    { name: '10,000 minutes', value: 10000 },
];

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('goal')
        .setDescription('Weekly server focus goals')
        .setDMPermission(false)
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Enable a recurring weekly focus goal')
            .addIntegerOption(opt => opt
                .setName('target')
                .setDescription('Weekly server focus target')
                .setRequired(true)
                .addChoices(...TARGET_CHOICES))
            .addChannelOption(opt => opt
                .setName('channel')
                .setDescription('Channel for completion announcements')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
        .addSubcommand(sub => sub
            .setName('status')
            .setDescription('View this week\'s server goal'))
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('View the top contributors this week'))
        .addSubcommand(sub => sub
            .setName('claim')
            .setDescription('Claim the completed weekly goal reward'))
        .addSubcommand(sub => sub
            .setName('disable')
            .setDescription('Disable recurring weekly goals')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'setup' || subcommand === 'disable') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'missingPermissionTitle'), t(language, 'goalManagePermissionBody'))],
                    flags: 64,
                });
            }
        }

        if (subcommand === 'setup') return handleSetup(interaction, language);
        if (subcommand === 'leaderboard') return handleLeaderboard(interaction, language);
        if (subcommand === 'claim') return handleClaim(interaction, language);
        if (subcommand === 'disable') return handleDisable(interaction, language);
        return handleStatus(interaction, language);
    },
};

async function handleSetup(interaction, language = getInteractionLanguage(interaction)) {
    const target = interaction.options.getInteger('target', true);
    const channel = interaction.options.getChannel('channel', true);
    const permissions = channel.permissionsFor(interaction.guild.members.me);

    if (!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ])) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'channelPermissionMissingTitle'), t(language, 'goalChannelPermissionBody', { channel }))],
            flags: 64,
        });
    }

    const goal = configureGuildGoal(interaction.guildId, target, channel.id);
    const settings = getOrCreateGuildSettings(interaction.guildId);
    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'goalEnabledTitle'),
            t(language, 'goalEnabledBody', {
                target: formatTime(goal.target_minutes),
                channel,
                minimum: formatTime(goal.min_contribution),
                water: goal.reward_water,
                xp: goal.reward_xp,
                timezone: settings.timezone || 'UTC',
            })
        )],
    });
}

async function handleStatus(interaction, language = getInteractionLanguage(interaction)) {
    const goal = getOrCreateCurrentGuildGoal(interaction.guildId);
    const settings = getOrCreateGuildSettings(interaction.guildId);
    if (!goal) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'goalsDisabledTitle'), t(language, 'goalsDisabledSetupBody'))],
            flags: 64,
        });
    }

    const stats = getGuildGoalStats(goal.id);
    const personal = getGuildGoalContribution(goal.id, interaction.user.id);
    const completedText = goal.status === 'completed'
        ? `\n\n**${t(language, 'goalCompleteClaimBody')}**`
        : '';

    const embed = new EmbedBuilder()
        .setColor(goal.status === 'completed' ? Colors.SUCCESS : Colors.STUDY)
        .setTitle(t(language, 'weeklyServerGoalTitle'))
        .setDescription(
            `${progressBar(stats.total_minutes, goal.target_minutes, 16)}\n\n` +
            `${t(language, 'progressLabel')}: **${formatTime(stats.total_minutes)} / ${formatTime(goal.target_minutes)}**\n` +
            `${t(language, 'contributorsLabel')}: **${stats.contributors}**\n` +
            `${t(language, 'yourContributionLabel')}: **${formatTime(personal)}**\n` +
            `${t(language, 'claimRequirementLabel')}: **${formatTime(goal.min_contribution)}**\n` +
            `${t(language, 'rewardLabelPlain')}: **${goal.reward_water} ${t(language, 'waterLabel')} + ${goal.reward_xp} XP**` +
            completedText
        )
        .setFooter({ text: t(language, 'weekStartedFooter', { date: goal.week_start, timezone: settings.timezone || 'UTC' }) })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction, language = getInteractionLanguage(interaction)) {
    const goal = getOrCreateCurrentGuildGoal(interaction.guildId);
    if (!goal) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'goalsDisabledTitle'), t(language, 'goalsDisabledServerBody'))],
            flags: 64,
        });
    }

    const contributors = getGuildGoalContributors(goal.id, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const description = contributors.length
        ? contributors.map((row, index) =>
            `${medals[index] || `**${index + 1}.**`} <@${row.user_id}> - **${formatTime(row.minutes)}**`
        ).join('\n')
        : t(language, 'noGoalContributionBody');

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(t(language, 'weeklyGoalContributorsTitle'))
        .setDescription(description)
        .setFooter({ text: `${t(language, 'targetLabel')}: ${formatTime(goal.target_minutes)}` })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleClaim(interaction, language = getInteractionLanguage(interaction)) {
    const result = await claimGuildGoalReward(interaction.guildId, interaction.user.id);
    if (!result.success) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'rewardUnavailableTitle'), goalRewardErrorMessage(result, language))],
            flags: 64,
        });
    }

    const levelText = applyLevelUps(interaction.user.id, language);

    let fruitLine = '';
    if (result.fruits && Object.keys(result.fruits).length > 0) {
        fruitLine = '\n' + Object.entries(result.fruits)
            .map(([key, qty]) => `+${qty} ${Plants[key]?.emoji || '🌿'} ${Plants[key]?.name || key}`)
            .join(', ');
    }

    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'weeklyGoalRewardClaimedTitle'),
            t(language, 'goalRewardClaimedBody', {
                water: result.goal.reward_water,
                xp: result.goal.reward_xp,
                contribution: formatTime(result.contribution),
                levelText,
            }) + fruitLine
        )],
    });
}

async function handleDisable(interaction, language = getInteractionLanguage(interaction)) {
    disableGuildGoal(interaction.guildId);
    return interaction.reply({
        embeds: [successEmbed(t(language, 'weeklyGoalsDisabledTitle'), t(language, 'weeklyGoalsDisabledBody'))],
        flags: 64,
    });
}

async function applyLevelUps(userId, language = 'en') {
    const user = getOrCreateUser(userId);
    let newLevel = user.level;
    while (user.xp >= xpForLevel(newLevel)) newLevel++;
    if (newLevel <= user.level) return '';
    updateUser(userId, { level: newLevel });
    return t(language, 'levelUpLine', { level: newLevel });
}

function goalRewardErrorMessage(result, language) {
    if (result.reason === 'disabled') return t(language, 'goalRewardDisabled');
    if (result.reason === 'incomplete') return t(language, 'goalRewardIncomplete');
    if (result.reason === 'claimed') return t(language, 'goalRewardClaimed');
    if (result.reason === 'contribution') {
        return t(language, 'goalRewardContribution', {
            minimum: formatTime(result.goal.min_contribution),
            current: formatTime(result.contribution),
        });
    }
    return t(language, 'goalRewardUnavailable');
}
