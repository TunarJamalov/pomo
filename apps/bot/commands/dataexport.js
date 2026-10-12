const {
    SlashCommandBuilder,
    AttachmentBuilder,
} = require('discord.js');
const { db } = require('../utils/database');
const { isPremium } = require('../utils/premiumCheck');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const PERIODS = new Set([30, 90, 365]);

module.exports = {
    cooldown: 15,
    data: new SlashCommandBuilder()
        .setName('dataexport')
        .setDescription('Export your Pomo Pro focus history as CSV')
        .addIntegerOption(option =>
            option.setName('period')
                .setDescription('History period to export')
                .setRequired(true)
                .addChoices(
                    { name: 'Last 30 days', value: 30 },
                    { name: 'Last 90 days', value: 90 },
                    { name: 'Last 365 days', value: 365 },
                )),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        await interaction.deferReply({ flags: 64 });
        const premium = await isPremium(interaction.client, interaction.user.id);
        if (!premium) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    t(language, 'proFeatureTitle'),
                    t(language, 'dataExportLockedBody')
                )],
            });
        }

        const periodDays = normalizePeriod(interaction.options.getInteger('period'));
        const rows = getFocusExportRows(interaction.user.id, periodDays);
        if (rows.length === 0) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    t(language, 'dataExportNoDataTitle'),
                    t(language, 'dataExportNoDataBody', { days: periodDays })
                )],
            });
        }

        const csv = buildFocusCsv(rows);
        const date = new Date().toISOString().slice(0, 10);
        const attachment = new AttachmentBuilder(
            Buffer.from(`\uFEFF${csv}`, 'utf8'),
            { name: `pomobot_focus_${periodDays}d_${date}.csv` },
        );

        return interaction.editReply({
            content: t(language, 'dataExportCompleteBody', {
                count: rows.length,
                plural: rows.length === 1 ? '' : 's',
                days: periodDays,
            }),
            files: [attachment],
        });
    },
};

function normalizePeriod(value) {
    const period = Number(value);
    return PERIODS.has(period) ? period : 90;
}

function getFocusExportRows(userId, periodDays, now = new Date()) {
    const safePeriod = normalizePeriod(periodDays);
    const endDate = new Date(now);
    const startDate = new Date(endDate.getTime() - safePeriod * 86400000);
    const startTimestamp = toSqliteDate(startDate);
    const endTimestamp = toSqliteDate(endDate);

    return db.prepare(`
        SELECT
            date(occurred_at) as date,
            occurred_at as started_at_utc,
            source,
            minutes as duration_minutes,
            title,
            guild_id
        FROM (
            SELECT
                started_at as occurred_at,
                'solo' as source,
                duration as minutes,
                COALESCE(NULLIF(title, ''), 'Study Session') as title,
                guild_id
            FROM study_sessions
            WHERE user_id = ?
              AND completed = 1
              AND title != '__break__'
              AND datetime(started_at) BETWEEN datetime(?) AND datetime(?)

            UNION ALL

            SELECT
                ts.started_at as occurred_at,
                'team' as source,
                ts.duration as minutes,
                'Team Session' as title,
                ts.guild_id
            FROM team_members tm
            JOIN team_sessions ts ON tm.session_id = ts.id
            WHERE tm.user_id = ?
              AND ts.status = 'completed'
              AND datetime(ts.started_at) BETWEEN datetime(?) AND datetime(?)

            UNION ALL

            SELECT
                ended_at as occurred_at,
                'voice' as source,
                credited_minutes as minutes,
                'Voice Focus' as title,
                guild_id
            FROM voice_sessions
            WHERE user_id = ?
              AND status = 'completed'
              AND credited_minutes > 0
              AND datetime(ended_at) BETWEEN datetime(?) AND datetime(?)
        )
        ORDER BY datetime(occurred_at) DESC
    `).all(
        userId, startTimestamp, endTimestamp,
        userId, startTimestamp, endTimestamp,
        userId, startTimestamp, endTimestamp,
    );
}

function buildFocusCsv(rows) {
    const headers = [
        'date',
        'started_at_utc',
        'source',
        'duration_minutes',
        'title',
        'guild_id',
    ];
    const lines = [headers.join(',')];

    for (const row of rows) {
        lines.push(headers.map(header => escapeCsvCell(row[header])).join(','));
    }
    return `${lines.join('\r\n')}\r\n`;
}

function escapeCsvCell(value) {
    if (value === null || value === undefined) return '';
    let text = String(value).replace(/\r\n|\r|\n/g, ' ');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    if (/[",]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
    return text;
}

function toSqliteDate(value) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
}

module.exports.normalizePeriod = normalizePeriod;
module.exports.getFocusExportRows = getFocusExportRows;
module.exports.buildFocusCsv = buildFocusCsv;
module.exports.escapeCsvCell = escapeCsvCell;
