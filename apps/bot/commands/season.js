const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const {
    getActiveSeason,
    startNewSeason,
    getSeasonLeaderboard,
    getSeasonRewards,
    getUserSeasonHistory,
    getLastArchivedSeasonTop,
} = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

// SEASON_REWARDS titles are tier identifiers saved in season_results.reward_tier;
// they stay English in the DB and are translated only when displayed.
const SEASON_REWARD_KEYS = {
    'Focus Initiate': 'seasonRewardInitiate',
    'Season Scholar': 'seasonRewardScholar',
    'Deep Work Veteran': 'seasonRewardVeteran',
    'Focus Protocol Elite': 'seasonRewardElite',
};

function rewardTitle(language, title) {
    const key = SEASON_REWARD_KEYS[title];
    return key ? t(language, `${key}Title`) : title;
}

function rewardDescription(language, reward) {
    const key = SEASON_REWARD_KEYS[reward.title];
    return key ? t(language, `${key}Reward`) : reward.reward;
}

const SCOPE_KEYS = { users: 'seasonScopeUsers', guilds: 'seasonScopeGuilds', clans: 'seasonScopeClans' };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('season')
        .setDescription('View the global Pomo season and seasonal leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('current')
                .setDescription('View the current active season')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View the current global season leaderboard')
                .addStringOption(option => option
                    .setName('scope')
                    .setDescription('Choose what to rank')
                    .addChoices(
                        { name: 'Users', value: 'users' },
                        { name: 'Servers', value: 'guilds' },
                        { name: 'Clans', value: 'clans' },
                    ))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rewards')
                .setDescription('View seasonal reward thresholds')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('history')
                .setDescription('Your results in past seasons')
        ),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'current') {
            const activeSeason = getActiveSeason();
            const name = activeSeason ? activeSeason.name : t(language, 'premiumUnknown');
            const startedAt = activeSeason ? activeSeason.started_at : t(language, 'premiumUnknown');

            const embed = new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`🌍 ${t(language, 'currentSeasonTitle')}`)
                .setDescription(`**${t(language, 'activeSeasonLabel')}:** ${name}\n**${t(language, 'startedAtLabel')}:** ${startedAt} (UTC)`)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        if (subcommand === 'leaderboard') return handleLeaderboard(interaction, language);
        if (subcommand === 'rewards') return handleRewards(interaction, language);
        if (subcommand === 'history') return handleHistory(interaction, language);
    },
};

async function handleLeaderboard(interaction, language = getInteractionLanguage(interaction)) {
    const scope = interaction.options.getString('scope') || 'users';
    const rows = getSeasonLeaderboard(scope, 10);
    const medals = ['🥇', '🥈', '🥉'];
    const lines = rows.map((row, index) => {
        const medal = medals[index] || `**${index + 1}.**`;
        if (scope === 'guilds') return t(language, 'seasonLeaderboardEntityLine', { medal, name: row.guild_name || row.guild_id, xp: row.season_xp, level: row.level });
        if (scope === 'clans') return t(language, 'seasonLeaderboardEntityLine', { medal, name: row.name, xp: row.season_xp, level: row.level });
        return t(language, 'seasonLeaderboardUserLine', { medal, user: `<@${row.discord_id}>`, xp: row.season_xp, minutes: row.season_focus_minutes });
    });

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.MARKET)
            .setTitle(`🌍 ${t(language, 'seasonLeaderboardTitle', { scope: SCOPE_KEYS[scope] ? t(language, SCOPE_KEYS[scope]) : scope })}`)
            .setDescription(lines.length ? lines.join('\n') : t(language, 'seasonLeaderboardEmpty'))
            .setFooter({ text: t(language, 'seasonLeaderboardFooter') })
            .setTimestamp()],
    });
}

async function handleRewards(interaction, language = getInteractionLanguage(interaction)) {
    const rewards = getSeasonRewards();
    const description = rewards
        .map(reward => t(language, 'seasonRewardsLine', {
            threshold: reward.threshold,
            title: rewardTitle(language, reward.title),
            reward: rewardDescription(language, reward),
        }))
        .join('\n\n');

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`🎁 ${t(language, 'seasonRewardsTitle')}`)
            .setDescription(description)
            .setFooter({ text: t(language, 'seasonRewardsFooter') })
            .setTimestamp()],
    });
}

async function handleHistory(interaction, language = getInteractionLanguage(interaction)) {
    const history = getUserSeasonHistory(interaction.user.id, 5);
    const top = getLastArchivedSeasonTop('user', 3);
    const medals = ['🥇', '🥈', '🥉'];

    const mine = history.length
        ? history.map(r => t(language, 'seasonHistoryLine', {
            season: r.season_name,
            rank: r.rank,
            participants: r.participants,
            xp: r.season_xp,
            minutes: r.season_focus_minutes,
            tier: r.reward_tier ? ` · 🏅 ${rewardTitle(language, r.reward_tier)}` : '',
        })).join('\n')
        : t(language, 'seasonHistoryEmpty');
    const podium = top.rows.length
        ? `\n\n${t(language, 'seasonHistoryTopOf', { season: top.season })}\n` + top.rows.map((r, i) => `${medals[i]} <@${r.entity_id}> — ${r.season_xp} XP`).join('\n')
        : '';

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`📜 ${t(language, 'seasonHistoryTitle')}`)
            .setDescription(mine + podium)
            .setTimestamp()],
        flags: 64,
    });
}

// Started from the owner-only /ownertools command
async function handleSeasonStart(interaction) {
    const language = getInteractionLanguage(interaction);
    const ownerId = process.env.OWNER_ID;
    if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: `❌ ${t(language, 'ownerOnlyBody')}`, flags: 64 });
    }
    const seasonName = interaction.options.getString('name');
    const result = startNewSeason(seasonName);
    if (!result.success) {
        if (result.reason === 'already_exists') {
            return interaction.reply({
                content: `❌ ${t(language, 'seasonAlreadyExistsBody', { name: seasonName })}`,
                flags: 64,
            });
        }
        return interaction.reply({ content: `❌ ${t(language, 'seasonNameRequiredBody')}`, flags: 64 });
    }

    const archivedLine = result.archived
        ? `\n\n${t(language, 'seasonArchivedLine', {
            users: result.archived.users,
            guilds: result.archived.guilds,
            clans: result.archived.clans,
        })}`
        : '';
    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`🎉 ${t(language, 'seasonStartedTitle')}`)
        .setDescription(t(language, 'seasonStartedBody', { name: seasonName }) + archivedLine)
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

module.exports.handleSeasonStart = handleSeasonStart;
