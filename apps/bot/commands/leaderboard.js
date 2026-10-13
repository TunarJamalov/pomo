/**
 * /leaderboard — View server or global leaderboard.
 * Ranks users by total focus minutes, top 10 with medals.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { db, getOrCreateUser, getClanLeaderboardTotal, getOrCreateGuildSettings } = require('../utils/database');
const { getDayWindow, getWeekWindow, toSqlDateTime } = require('../utils/timezone');
const { formatTime } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the study leaderboard')
        .addStringOption(opt => opt
            .setName('type')
            .setDescription('Rank by Focus Time or XP')
            .addChoices(
                { name: 'Focus Time (Default)', value: 'time' },
                { name: 'XP', value: 'xp' }
            )
        ),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const type = interaction.options.getString('type') || 'time';
        const scope = type === 'xp' ? 'global_alltime_xp' : 'global_alltime';
        const row = buildDropdown(scope, language);
        await interaction.deferReply();
        const embed = await buildLeaderboardEmbed(interaction, scope, language);
        await interaction.editReply({ embeds: [embed], components: [row] });
    },
};

function buildDropdown(selected, language = 'en') {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('leaderboard_scope')
            .setPlaceholder(t(language, 'leaderboardScopePlaceholder'))
            .addOptions([
                { label: t(language, 'leaderboardGlobalFocus'), value: 'global_alltime', emoji: '🌌', description: t(language, 'leaderboardGlobalFocusDesc'), default: selected === 'global_alltime' },
                { label: t(language, 'leaderboardGlobalXp'), value: 'global_alltime_xp', emoji: '🌟', description: t(language, 'leaderboardGlobalXpDesc'), default: selected === 'global_alltime_xp' },
                { label: t(language, 'leaderboardServerWeek'), value: 'server_week', emoji: '📅', description: t(language, 'leaderboardServerWeekDesc'), default: selected === 'server_week' },
                { label: t(language, 'leaderboardServerToday'), value: 'server_today', emoji: '☀️', description: t(language, 'leaderboardServerTodayDesc'), default: selected === 'server_today' },
                { label: t(language, 'leaderboardServerFocus'), value: 'server_alltime', emoji: '🏛️', description: t(language, 'leaderboardServerFocusDesc'), default: selected === 'server_alltime' },
                { label: t(language, 'leaderboardServerXp'), value: 'server_alltime_xp', emoji: '⭐', description: t(language, 'leaderboardServerXpDesc'), default: selected === 'server_alltime_xp' },
                { label: t(language, 'leaderboardSeasonFocus'), value: 'global_season', emoji: '🌍', description: t(language, 'leaderboardSeasonFocusDesc'), default: selected === 'global_season' },
                { label: t(language, 'leaderboardSeasonXp'), value: 'global_season_xp', emoji: '✨', description: t(language, 'leaderboardSeasonXpDesc'), default: selected === 'global_season_xp' },
                { label: t(language, 'leaderboardTopClans'), value: 'clans', emoji: '🛡️', description: t(language, 'leaderboardTopClansDesc'), default: selected === 'clans' },
            ])
    );
}

/**
 * Build leaderboard embed for the given scope.
 */
async function buildLeaderboardEmbed(interaction, scope, language = 'en') {
    // ─── Clan Leaderboard ─────────────────────────────────────
    if (scope === 'clans') {
        const topClans = getClanLeaderboardTotal(10);
        const medals = ['🏆', '🥇', '🥈', '🥉'];
        let desc = `${t(language, 'leaderboardClanBody')}\n\n`;
        if (topClans.length === 0) {
            desc += `*${t(language, 'leaderboardNoClans')}*`;
        } else {
            topClans.forEach((c, i) => {
                const icon = i === 0 ? medals[0] : (i < 4 ? medals[i] : `\`${i + 1}\``);
                desc += `${icon} **${c.name}** — Lv.${c.level} | ${c.xp} XP | ⏱️ ${formatTime(c.total_focus_minutes)}\n`;
            });
        }
        return new EmbedBuilder()
            .setColor(Colors.STUDY)
            .setTitle(`🛡️ ${t(language, 'leaderboardClanTitle')}`)
            .setDescription(desc)
            .setFooter({ text: t(language, 'leaderboardClanFooter') })
            .setTimestamp();
    }

    if (scope === 'server_week' || scope === 'server_today') {
        return buildServerPeriodEmbed(interaction, scope, language);
    }

    // ─── Personal Leaderboard ──────────────────────────────────
    const medals = ['🥇', '🥈', '🥉'];
    const isSeason = scope.includes('season');
    const isGlobal = scope.includes('global');
    const isXP = scope.includes('_xp');
    
    let column = 'total_focus_minutes';
    if (isSeason && isXP) column = 'season_xp';
    else if (isSeason) column = 'season_focus_minutes';
    else if (isXP) column = 'xp';

    const activeSeason = db.prepare('SELECT name FROM seasons WHERE is_active = 1').get();
    const periodName = isSeason ? (activeSeason ? activeSeason.name : t(language, 'currentSeason')) : t(language, 'allTimePeriod');
    const metricName = isXP ? 'XP' : t(language, 'focusTimeMetric');
    const scopeIcon = isGlobal ? '🌍' : '🏠';
    const title = `${scopeIcon} ${t(language, 'leaderboardTitle', {
        period: periodName,
        scope: isGlobal ? t(language, 'globalScope') : t(language, 'serverScope'),
        metric: metricName,
    })}`;

    let users;
    if (!isGlobal) {
        users = await getServerLeaderboardUsers(interaction.guild, column);
    } else {
        users = db.prepare(`SELECT * FROM users ORDER BY ${column} DESC LIMIT 10`).all();
    }

    if (!users || users.length === 0) {
        return new EmbedBuilder()
            .setColor(Colors.INFO).setTitle(title)
            .setDescription(t(language, 'noLeaderboardData'))
            .setTimestamp();
    }

    let leaderboardDisplay = '';
    for (let i = 0; i < users.length; i++) {
        const u = users[i];
        const val = u[column];
        if (!val || val === 0) continue;
        const medal = medals[i] || `**${i + 1}.**`;
        const displayVal = isXP ? `${val} XP` : `${formatTime(val)} ⏱️`;
        leaderboardDisplay += `${medal} <@${u.discord_id}> — ${displayVal} | Lvl ${u.level} | 🔥 ${u.streak}\n`;
    }

    if (!leaderboardDisplay) leaderboardDisplay = t(language, 'noFocusedUsers');

    const userId = interaction.user.id;
    let userRank = '—';
    if (isGlobal) {
        const rank = db.prepare(
            `SELECT COUNT(*) + 1 as rank FROM users WHERE ${column} > (SELECT COALESCE(${column}, 0) FROM users WHERE discord_id = ?)`
        ).get(userId);
        if (rank) userRank = `#${rank.rank}`;
    }

    return new EmbedBuilder()
        .setColor(isXP ? Colors.PROFILE : Colors.MARKET)
        .setTitle(title)
        .setDescription(leaderboardDisplay)
        .setFooter({
            text: isGlobal
                ? t(language, 'yourRank', { rank: userRank })
                : t(language, 'rankedBy', {
                    period: isSeason ? t(language, 'seasonalPeriod') : t(language, 'allTimeLower'),
                    metric: isXP ? 'XP' : t(language, 'focusTimeMetric').toLowerCase(),
                }),
        })
        .setTimestamp();
}

/**
 * Minutes studied in one server between two UTC times, from every source:
 * solo (/study, /pomodoro), team sessions and tracked voice. Voice credit
 * already excludes minutes that overlap a running timer, so nothing counts twice.
 */
function getServerPeriodRows(guildId, startUtc, endUtc, limit = 10) {
    const from = toSqlDateTime(startUtc);
    const to = toSqlDateTime(endUtc);
    return db.prepare(`
        SELECT user_id, SUM(minutes) AS minutes FROM (
            SELECT user_id, duration AS minutes FROM study_sessions
            WHERE guild_id = ? AND completed = 1 AND title != '__break__'
              AND started_at >= ? AND started_at < ?
            UNION ALL
            SELECT tm.user_id, ts.duration AS minutes FROM team_members tm
            JOIN team_sessions ts ON ts.id = tm.session_id
            WHERE ts.guild_id = ? AND ts.status = 'completed'
              AND ts.started_at >= ? AND ts.started_at < ?
            UNION ALL
            SELECT user_id, credited_minutes AS minutes FROM voice_sessions
            WHERE guild_id = ? AND status = 'completed' AND credited_minutes > 0
              AND ended_at >= ? AND ended_at < ?
        )
        GROUP BY user_id
        HAVING minutes > 0
        ORDER BY minutes DESC
        LIMIT ?
    `).all(guildId, from, to, guildId, from, to, guildId, from, to, limit);
}

function buildServerPeriodEmbed(interaction, scope, language = 'en') {
    const isWeek = scope === 'server_week';
    const title = `📅 ${t(language, 'leaderboardTitle', {
        period: t(language, isWeek ? 'thisWeekLabel' : 'todayLabel'),
        scope: t(language, 'serverScope'),
        metric: t(language, 'focusTimeMetric'),
    })}`;
    const footer = t(language, 'leaderboardServerPeriodFooter');
    if (!interaction.guildId) {
        return new EmbedBuilder().setColor(Colors.INFO).setTitle(title).setDescription(t(language, 'noLeaderboardData')).setFooter({ text: footer }).setTimestamp();
    }

    const timeZone = getOrCreateGuildSettings(interaction.guildId)?.timezone || 'UTC';
    const window = isWeek ? getWeekWindow(new Date(), timeZone) : getDayWindow(new Date(), timeZone);
    const rows = getServerPeriodRows(interaction.guildId, window.startUtc, window.endUtc);
    const medals = ['🥇', '🥈', '🥉'];
    const description = rows.length
        ? rows.map((row, i) => `${medals[i] || `**${i + 1}.**`} <@${row.user_id}> — ${formatTime(row.minutes)} ⏱️`).join('\n')
        : t(language, 'noLeaderboardData');

    return new EmbedBuilder()
        .setColor(Colors.MARKET)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: footer })
        .setTimestamp();
}

/**
 * Top 10 for a server without fetching every member: rank people who have
 * studied in this server (solo, voice or team), then confirm only the best
 * candidates are still members.
 */
async function getServerLeaderboardUsers(guild, column) {
    if (!guild) return [];
    const candidates = db.prepare(`
        SELECT u.* FROM users u
        WHERE u.discord_id IN (
            SELECT user_id FROM study_sessions WHERE guild_id = ?
            UNION SELECT user_id FROM voice_sessions WHERE guild_id = ?
            UNION SELECT tm.user_id FROM team_members tm
                JOIN team_sessions ts ON ts.id = tm.session_id
                WHERE ts.guild_id = ?
        )
        AND COALESCE(u.${column}, 0) > 0
        ORDER BY u.${column} DESC
        LIMIT 50
    `).all(guild.id, guild.id, guild.id);
    if (candidates.length === 0) return [];

    let present = null;
    try {
        const members = await guild.members.fetch({ user: candidates.map(c => c.discord_id) });
        present = new Set(members.keys());
    } catch (_) {
        present = null; // fall back to unfiltered candidates if Discord is unavailable
    }
    return candidates.filter(c => !present || present.has(c.discord_id)).slice(0, 10);
}

/**
 * Handle leaderboard scope selection.
 */
async function handleLeaderboardScope(interaction) {
    const scope = interaction.values[0];
    const language = getInteractionLanguage(interaction);
    await interaction.deferUpdate();
    const embed = await buildLeaderboardEmbed(interaction, scope, language);
    const row = buildDropdown(scope, language);
    await interaction.editReply({ embeds: [embed], components: [row] });
}

module.exports.handleLeaderboardScope = handleLeaderboardScope;
module.exports.getServerPeriodRows = getServerPeriodRows;
module.exports.buildDropdown = buildDropdown;
