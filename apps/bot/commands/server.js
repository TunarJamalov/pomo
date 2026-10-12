const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getGuildProgress,
    getGuildXpToNextLevel,
    getCurrentGuildQuests,
    claimGuildQuestReward,
    SERVER_QUEST_DEFINITIONS,
    getOrCreateUser,
    updateUser,
} = require('../utils/database');
const { Colors, xpForLevel } = require('../utils/constants');
const { errorEmbed, formatTime, progressBar, successEmbed } = require('../utils/embeds');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('server')
        .setDescription('View shared server progression')
        .setDMPermission(false)
        .addSubcommand(subcommand => subcommand
            .setName('progress')
            .setDescription('View this server\'s focus progress and level'))
        .addSubcommand(subcommand => subcommand
            .setName('quests')
            .setDescription('View this week\'s shared server quests'))
        .addSubcommand(subcommand => subcommand
            .setName('claim')
            .setDescription('Claim completed shared server quest rewards')
            .addStringOption(option => option
                .setName('quest')
                .setDescription('Quest key, or leave empty to claim all')
                .setRequired(false)
                .addChoices(...SERVER_QUEST_DEFINITIONS.map(quest => ({
                    name: quest.title,
                    value: quest.key,
                }))))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'quests') return handleQuests(interaction);
        if (subcommand === 'claim') return handleClaim(interaction);
        if (subcommand !== 'progress') return;

        const progress = getGuildProgress(interaction.guildId);
        const levelProgress = getGuildXpToNextLevel(progress);
        const percent = levelProgress.required > 0
            ? Math.min(100, Math.round((levelProgress.current / levelProgress.required) * 100))
            : 0;
        const filled = Math.round(percent / 10);
        const progressBar = `${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}`;
        const guildName = progress.guild_name || interaction.guild.name;

        const embed = new EmbedBuilder()
            .setColor(Colors.PRIMARY)
            .setTitle(`📡 ${guildName} Focus Protocol`)
            .setDescription(
                `Shared study progress for **${guildName}**\n` +
                `${progressBar} **${percent}%**`,
            )
            .addFields(
                { name: 'Server Level', value: `**${progress.level}**`, inline: true },
                { name: 'Server XP', value: `**${progress.xp}**`, inline: true },
                { name: 'Next Level', value: `**${levelProgress.remaining} XP** remaining`, inline: true },
                { name: 'Focus Time', value: formatTime(progress.total_focus_minutes), inline: true },
                { name: 'Completed Sessions', value: `${progress.total_sessions}`, inline: true },
                { name: 'Season XP', value: `${progress.season_xp}`, inline: true },
            )
            .setFooter({ text: 'Every completed solo or voice study session helps this server level up.' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};

async function handleQuests(interaction) {
    const quests = getCurrentGuildQuests(interaction.guildId);
    const description = quests.map(quest => {
        const percent = Math.min(100, Math.floor((quest.progress / quest.target) * 100));
        const state = quest.status === 'completed' ? '✅ Complete' : `${percent}%`;
        return `**${quest.title}** — ${state}\n${progressBar(quest.progress, quest.target, 12)} **${quest.progress}/${quest.target}**\n_${quest.description}_\nReward: **${quest.reward_water} Water + ${quest.reward_xp} XP**`;
    }).join('\n\n');

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.STUDY)
            .setTitle('📜 Weekly Server Quests')
            .setDescription(description || 'No server quests are active yet.')
            .setFooter({ text: 'Complete quests together, then use /server claim.' })
            .setTimestamp()],
    });
}

async function handleClaim(interaction) {
    const questKey = interaction.options.getString('quest') || null;
    const result = claimGuildQuestReward(interaction.guildId, interaction.user.id, questKey);
    if (!result.success) {
        const message = result.reason === 'claimed'
            ? 'You have already claimed this quest reward.'
            : questKey
                ? 'That quest is not completed or is not active this week.'
                : 'There are no completed server quest rewards to claim.';
        return interaction.reply({
            embeds: [errorEmbed('Reward Unavailable', message)],
            flags: 64,
        });
    }

    const levelText = applyLevelUps(interaction.user.id);
    const names = result.quests.map(quest => quest.title).join(', ');
    return interaction.reply({
        embeds: [successEmbed(
            '🎁 Server Quest Rewards Claimed',
            `Completed: **${names}**\n\n+${result.water} Water\n+${result.xp} XP${levelText}`,
        )],
    });
}

function applyLevelUps(userId) {
    const user = getOrCreateUser(userId);
    let level = user.level;
    while (user.xp >= xpForLevel(level)) level += 1;
    if (level === user.level) return '';
    updateUser(userId, { level });
    return `\n\n🎉 Level up! You are now level **${level}**.`;
}
