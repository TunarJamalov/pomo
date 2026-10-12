const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed } = require('../utils/embeds');
const { db } = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

const STATUS_CHOICES = [
    { name: 'All servers', value: 'all' },
    { name: 'Configured servers', value: 'configured' },
    { name: 'Unconfigured servers', value: 'unconfigured' },
    { name: 'Recently active servers', value: 'active' },
];

module.exports = {
    ownerOnly: true,
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('ownercontacts')
        .setDescription('Export server owner contacts and activation signals (Owner only)')
        .addStringOption(option =>
            option.setName('status')
                .setDescription('Which servers to include in the export')
                .addChoices(...STATUS_CHOICES))
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('Maximum number of servers to export')
                .setMinValue(1)
                .setMaxValue(500))
        .addIntegerOption(option =>
            option.setName('min_members')
                .setDescription('Minimum server member count (e.g. 200 for 200+ servers)')
                .setMinValue(0)
                .setMaxValue(100000)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'unauthorizedTitle'), t(language, 'ownerOnlyCommandBody'))],
                flags: 64,
            });
        }

        await interaction.deferReply({ flags: 64 });

        const status = interaction.options.getString('status') || 'all';
        const limit = interaction.options.getInteger('limit') || 100;
        const minMembers = interaction.options.getInteger('min_members') || 0;
        const dbRows = getGuildRowsById();
        const guildRows = Array.from(interaction.client.guilds.cache.values())
            .map(guild => buildGuildRow(guild, dbRows.get(guild.id)))
            .filter(row => matchesStatus(row, status))
            .filter(row => row.member_count >= minMembers)
            .sort((a, b) => getPriority(b, status) - getPriority(a, status))
            .slice(0, limit);

        if (!guildRows.length) {
            const filterDesc = minMembers > 0 ? `**${status}** filter with **${minMembers}+** members` : `**${status}** filter`;
            return interaction.editReply({
                embeds: [errorEmbed('No Servers Found', `No current servers matched the ${filterDesc}.`)],
            });
        }

        await attachOwnerProfiles(interaction.client, guildRows);

        const csv = buildCsv(guildRows);
        const suffix = minMembers > 0 ? `-${minMembers}plus` : '';
        const attachment = new AttachmentBuilder(Buffer.from(csv, 'utf8'), {
            name: `pomo-ownercontacts-${status}${suffix}-${new Date().toISOString().slice(0, 10)}.csv`,
        });

        const configuredCount = guildRows.filter(row => row.configured).length;
        const activeCount = guildRows.filter(row => row.recent_active).length;
        const totalMembers = guildRows.reduce((sum, row) => sum + row.member_count, 0);

        const filterValue = minMembers > 0 ? `${status} + ${minMembers}+ members` : status;
        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle('Owner Contacts Export')
            .setDescription(
                'CSV is ready. This command does not DM anyone; it only exports owner contact signals for you.\n\n' +
                'Tip: start with active or large servers and send a short personal message.'
            )
            .addFields(
                { name: 'Filter', value: filterValue, inline: true },
                { name: 'Servers Exported', value: `${guildRows.length}`, inline: true },
                { name: 'Members Covered', value: `${totalMembers}`, inline: true },
                { name: 'Configured', value: `${configuredCount}`, inline: true },
                { name: 'Recently Active', value: `${activeCount}`, inline: true },
                { name: 'Useful columns', value: '`owner_username`, `owner_display_name`, `owner_profile_url`, `configured`, `focus_sessions_7d`', inline: false },
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed], files: [attachment] });
    },
};

function getGuildRowsById() {
    const rows = db.prepare(`
        SELECT
            gi.guild_id,
            gi.guild_name,
            gi.member_count,
            gi.owner_id,
            gi.joined_at,
            gi.last_seen_at,
            COALESCE(gs.language, 'en') as language,
            COALESCE(gs.voice_tracking_enabled, 0) as voice_tracking_enabled,
            COALESCE(gs.report_enabled, 0) as report_enabled,
            COALESCE(gs.goal_enabled, 0) as goal_enabled,
            COALESCE(command_stats.commands_7d, 0) as commands_7d,
            COALESCE(command_stats.command_users_7d, 0) as command_users_7d,
            COALESCE(focus_stats.focus_sessions_7d, 0) as focus_sessions_7d,
            COALESCE(focus_stats.focus_minutes_7d, 0) as focus_minutes_7d
        FROM guild_installations gi
        LEFT JOIN guild_settings gs ON gs.guild_id = gi.guild_id
        LEFT JOIN (
            SELECT
                guild_id,
                COUNT(*) as commands_7d,
                COUNT(DISTINCT user_id) as command_users_7d
            FROM command_usage
            WHERE guild_id IS NOT NULL
              AND used_at >= datetime('now', '-7 days')
            GROUP BY guild_id
        ) command_stats ON command_stats.guild_id = gi.guild_id
        LEFT JOIN (
            SELECT
                guild_id,
                COUNT(*) as focus_sessions_7d,
                SUM(minutes) as focus_minutes_7d
            FROM (
                SELECT guild_id, duration as minutes
                FROM study_sessions
                WHERE guild_id IS NOT NULL
                  AND completed = 1
                  AND title != '__break__'
                  AND started_at >= datetime('now', '-7 days')
                UNION ALL
                SELECT guild_id, duration as minutes
                FROM team_sessions
                WHERE status = 'completed'
                  AND started_at >= datetime('now', '-7 days')
                UNION ALL
                SELECT guild_id, credited_minutes as minutes
                FROM voice_sessions
                WHERE status = 'completed'
                  AND credited_minutes > 0
                  AND ended_at >= datetime('now', '-7 days')
            )
            GROUP BY guild_id
        ) focus_stats ON focus_stats.guild_id = gi.guild_id
        WHERE gi.active = 1
    `).all();

    return new Map(rows.map(row => [row.guild_id, row]));
}

function buildGuildRow(guild, saved = {}) {
    const voice = Number(saved.voice_tracking_enabled || 0) === 1;
    const reports = Number(saved.report_enabled || 0) === 1;
    const goals = Number(saved.goal_enabled || 0) === 1;
    const focusSessions = Number(saved.focus_sessions_7d || 0);
    const commands = Number(saved.commands_7d || 0);

    return {
        guild_id: guild.id,
        guild_name: guild.name || saved.guild_name || '',
        owner_id: guild.ownerId || saved.owner_id || '',
        owner_mention: guild.ownerId || saved.owner_id ? `<@${guild.ownerId || saved.owner_id}>` : '',
        owner_username: '',
        owner_display_name: '',
        owner_profile_url: '',
        owner_fetch_status: 'not_fetched',
        member_count: Number(guild.memberCount || saved.member_count || 0),
        configured: voice || reports || goals,
        voice_tracking_enabled: voice,
        weekly_reports_enabled: reports,
        weekly_goal_enabled: goals,
        language: saved.language || 'en',
        commands_7d: commands,
        command_users_7d: Number(saved.command_users_7d || 0),
        focus_sessions_7d: focusSessions,
        focus_minutes_7d: Number(saved.focus_minutes_7d || 0),
        recent_active: focusSessions > 0 || commands > 0,
        joined_at: saved.joined_at || '',
        last_seen_at: saved.last_seen_at || '',
    };
}

async function attachOwnerProfiles(client, rows) {
    const ownerIds = [...new Set(rows.map(row => row.owner_id).filter(Boolean))];
    const usersById = new Map();

    for (const ownerId of ownerIds) {
        const user = await client.users.fetch(ownerId).catch(() => null);
        usersById.set(ownerId, user);
    }

    for (const row of rows) {
        const user = usersById.get(row.owner_id);
        row.owner_fetch_status = user ? 'fetched' : 'failed';
        row.owner_username = user?.username || '';
        row.owner_display_name = user?.globalName || user?.displayName || '';
        row.owner_profile_url = row.owner_id ? `https://discord.com/users/${row.owner_id}` : '';
    }
}

function matchesStatus(row, status) {
    if (status === 'configured') return row.configured;
    if (status === 'unconfigured') return !row.configured;
    if (status === 'active') return row.recent_active;
    return true;
}

function getPriority(row, status) {
    if (status === 'active') {
        return (row.focus_sessions_7d * 10) + (row.commands_7d * 3) + row.member_count;
    }

    return (row.recent_active ? 5000 : 0) + row.member_count + (row.commands_7d * 3) + (row.focus_sessions_7d * 10);
}

function buildCsv(rows) {
    const headers = [
        'guild_name',
        'guild_id',
        'owner_id',
        'owner_mention',
        'owner_username',
        'owner_display_name',
        'owner_profile_url',
        'owner_fetch_status',
        'member_count',
        'configured',
        'voice_tracking_enabled',
        'weekly_reports_enabled',
        'weekly_goal_enabled',
        'language',
        'commands_7d',
        'command_users_7d',
        'focus_sessions_7d',
        'focus_minutes_7d',
        'recent_active',
        'joined_at',
        'last_seen_at',
    ];

    return [
        headers.join(','),
        ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
    ].join('\n');
}

function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\r?\n/g, ' ').replace(/"/g, '""');
    return `"${text}"`;
}
