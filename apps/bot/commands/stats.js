/**
 * /stats - View basic or Pomo Pro study analytics.
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
} = require('discord.js');
const { Colors, xpForLevel } = require('../utils/constants');
const { getOrCreateUser, db } = require('../utils/database');
const { hasFullPro } = require('../utils/premiumCheck');
const { generateStatsDashboard } = require('../utils/canvas');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { getInsights, buildInsightsEmbed } = require('../utils/insights');
const { nextOccurrence } = require('../utils/assistant');
const { buyButtons, checkoutConfigured } = require('../utils/billing');
const { isProTrialAvailable, proTrialButton } = require('../utils/proTrial');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your study statistics')
        .addStringOption(option =>
            option.setName('view')
                .setDescription('Choose stats view')
                .setRequired(false)
                .addChoices(
                    { name: 'Basic', value: 'basic' },
                    { name: 'Advanced (Premium)', value: 'advanced' },
                ))
        .addStringOption(option =>
            option.setName('period')
                .setDescription('Advanced analytics period')
                .setRequired(false)
                .addChoices(
                    { name: 'Last 7 days', value: '7' },
                    { name: 'Last 30 days', value: '30' },
                    { name: 'Last 90 days', value: '90' },
                )),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = getOrCreateUser(userId);
        const view = interaction.options.getString('view') || 'basic';
        const periodDays = Number(interaction.options.getString('period') || 30);

        await interaction.deferReply();

        if (view === 'advanced') {
            // Pro only (not in Plus)
            const premium = await hasFullPro(interaction.client, userId);
            if (!premium) {
                const preview = bestHourLine(language, userId, 'statsBestHourPreview');
                const embed = new EmbedBuilder()
                    .setColor(Colors.MARKET)
                    .setTitle(t(language, 'proFeatureTitle'))
                    .setDescription([preview, t(language, 'advancedStatsProBody')].filter(Boolean).join('\n\n'))
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed], components: proButtons(language, userId) });
            }

            return sendAdvancedStats(interaction, userId, user, periodDays, language);
        }

        return sendBasicStats(interaction, userId, user, language);
    },
};

async function sendBasicStats(interaction, userId, user, language = getInteractionLanguage(interaction)) {
    const soloSessions = db.prepare(
        "SELECT COUNT(*) as count FROM study_sessions WHERE user_id = ? AND completed = 1 AND title != '__break__'"
    ).get(userId).count;
    const teamSessions = db.prepare(
        "SELECT COUNT(*) as count FROM team_members tm JOIN team_sessions ts ON tm.session_id = ts.id WHERE tm.user_id = ? AND ts.status = 'completed'"
    ).get(userId).count;
    const voiceSessions = db.prepare(
        "SELECT COUNT(*) as count FROM voice_sessions WHERE user_id = ? AND status = 'completed' AND credited_minutes > 0"
    ).get(userId).count;
    const xpNeeded = xpForLevel(user.level);

    const statsData = {
        totalSessions: soloSessions + teamSessions + voiceSessions,
        xpNeeded,
        xpPercent: Math.min(Math.round((user.xp / xpNeeded) * 100), 100),
    };

    try {
        const buffer = await generateStatsDashboard(interaction.user, user, statsData, false);
        const attachment = new AttachmentBuilder(buffer, { name: 'stats_basic.png' });
        // Once Pro can be bought, show free users one real insight from their own data
        const teaser = checkoutConfigured() && !(await hasFullPro(interaction.client, userId))
            ? bestHourLine(language, userId, 'statsBestHourTeaser')
            : null;
        const content = [formatTopSubjects(userId), teaser].filter(Boolean).join('\n\n');
        return interaction.editReply({ content, files: [attachment] });
    } catch (error) {
        console.error('[STATS] Canvas error:', error);
        return interaction.editReply({ content: t(language, 'statsBasicFailedBody') });
    }
}

async function sendAdvancedStats(interaction, userId, user, periodDays, language = getInteractionLanguage(interaction)) {
    const statsData = getAdvancedStatsData(userId, periodDays);

    try {
        const buffer = await generateStatsDashboard(interaction.user, user, statsData, true);
        const attachment = new AttachmentBuilder(buffer, {
            name: `stats_advanced_${statsData.periodDays}d.png`,
        });
        const insights = buildInsightsEmbed(language, getInsights(userId, statsData.periodDays));
        return interaction.editReply({ content: formatTopSubjects(userId, periodDays), files: [attachment], embeds: [insights] });
    } catch (error) {
        console.error('[STATS] Canvas error:', error);
        return interaction.editReply({ content: t(language, 'statsAdvancedFailedBody') });
    }
}

function getAdvancedStatsData(userId, requestedPeriodDays = 30, now = new Date()) {
    const periodDays = [7, 30, 90].includes(Number(requestedPeriodDays))
        ? Number(requestedPeriodDays)
        : 30;
    const endDate = new Date(now);
    endDate.setUTCHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - periodDays + 1);
    const startKey = startDate.toISOString().slice(0, 10);
    const endKey = endDate.toISOString().slice(0, 10);

    const rows = db.prepare(`
        WITH focus AS (
            SELECT date(started_at) as focus_date, duration as minutes
            FROM study_sessions
            WHERE user_id = ?
              AND completed = 1
              AND title != '__break__'
              AND date(started_at) BETWEEN ? AND ?

            UNION ALL

            SELECT date(ts.started_at) as focus_date, ts.duration as minutes
            FROM team_members tm
            JOIN team_sessions ts ON tm.session_id = ts.id
            WHERE tm.user_id = ?
              AND ts.status = 'completed'
              AND date(ts.started_at) BETWEEN ? AND ?

            UNION ALL

            SELECT date(ended_at) as focus_date, credited_minutes as minutes
            FROM voice_sessions
            WHERE user_id = ?
              AND status = 'completed'
              AND credited_minutes > 0
              AND date(ended_at) BETWEEN ? AND ?
        )
        SELECT focus_date as date, COUNT(*) as sessions, SUM(minutes) as minutes
        FROM focus
        GROUP BY focus_date
        ORDER BY focus_date ASC
    `).all(
        userId, startKey, endKey,
        userId, startKey, endKey,
        userId, startKey, endKey,
    );
    const byDate = new Map(rows.map(row => [row.date, row]));
    const days = [];

    for (let index = 0; index < periodDays; index++) {
        const date = new Date(startDate);
        date.setUTCDate(startDate.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        const row = byDate.get(key);
        days.push({
            date: key,
            dayName: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }),
            sessions: row?.sessions || 0,
            minutes: row?.minutes || 0,
        });
    }

    const periodSessions = days.reduce((sum, day) => sum + day.sessions, 0);
    const periodMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
    const activeDays = days.filter(day => day.minutes > 0).length;
    const bestDay = days.reduce(
        (best, day) => day.minutes > best.minutes ? day : best,
        days[0],
    );
    const totalHarvests = db.prepare(
        'SELECT COUNT(*) as count FROM harvested_items WHERE user_id = ?'
    ).get(userId).count;
    const topSubjects = getTopSubjectsForWindow(userId, startKey, endKey, 5);

    return {
        periodDays,
        days,
        periodSessions,
        periodMinutes,
        activeDays,
        bestDay,
        avgLength: periodSessions > 0 ? Math.round(periodMinutes / periodSessions) : 0,
        totalHarvests,
        topSubjects,
    };
}

function getTopSubjects(userId, days = null, limit = 3) {
    const dateFilter = days
        ? "AND date(started_at) >= date('now', '-' || ? || ' days')"
        : '';
    const params = days ? [userId, days, limit] : [userId, limit];
    const rows = db.prepare(`
        SELECT COALESCE(NULLIF(subject, ''), 'general') as subject,
               SUM(duration) as minutes,
               COUNT(*) as sessions,
               ROUND(AVG(duration)) as avgMinutes
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          ${dateFilter}
        GROUP BY COALESCE(NULLIF(subject, ''), 'general')
        ORDER BY minutes DESC, sessions DESC
        LIMIT ?
    `).all(...params);
    const totalParams = days ? [userId, days] : [userId];
    const total = db.prepare(`
        SELECT SUM(duration) as minutes
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          ${dateFilter}
    `).get(...totalParams).minutes || 0;

    return withSubjectPercents(rows, total);
}

function getTopSubjectsForWindow(userId, startKey, endKey, limit = 5) {
    const rows = db.prepare(`
        SELECT COALESCE(NULLIF(subject, ''), 'general') as subject,
               SUM(duration) as minutes,
               COUNT(*) as sessions,
               ROUND(AVG(duration)) as avgMinutes
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          AND date(started_at) BETWEEN ? AND ?
        GROUP BY COALESCE(NULLIF(subject, ''), 'general')
        ORDER BY minutes DESC, sessions DESC
        LIMIT ?
    `).all(userId, startKey, endKey, limit);
    const total = db.prepare(`
        SELECT SUM(duration) as minutes
        FROM study_sessions
        WHERE user_id = ?
          AND completed = 1
          AND title != '__break__'
          AND date(started_at) BETWEEN ? AND ?
    `).get(userId, startKey, endKey).minutes || 0;

    return withSubjectPercents(rows, total);
}

function withSubjectPercents(rows, totalMinutes) {
    const total = Number(totalMinutes || 0);
    return rows.map(row => ({
        ...row,
        minutes: Number(row.minutes || 0),
        sessions: Number(row.sessions || 0),
        avgMinutes: Number(row.avgMinutes || 0),
        percent: total > 0 ? Math.round((Number(row.minutes || 0) / total) * 100) : 0,
    }));
}

/** The user's best study hour (last 30 days) as one line, or null with too few sessions. */
function bestHourLine(language, userId, key) {
    const { bestHour } = getInsights(userId, 30);
    return bestHour ? t(language, key, { time: nextOccurrence(bestHour.hour), share: bestHour.share }) : null;
}

/** Trial and buy buttons under the locked advanced view, once sales are open. */
function proButtons(language, userId) {
    if (!checkoutConfigured()) return [];
    const row = new ActionRowBuilder();
    if (isProTrialAvailable(userId)) row.addComponents(proTrialButton(language));
    row.addComponents(...buyButtons(language));
    return [row];
}

function formatTopSubjects(userId, days = null) {
    const rows = getTopSubjects(userId, days);
    if (!rows.length) return '';
    const label = days ? `Subject Focus (${days}d)` : 'Subject Focus';
    const body = rows
        .map(row => `${subjectLabel(row.subject)}: ${Math.floor(row.minutes / 60)}h ${row.minutes % 60}m (${row.percent}%, ${row.sessions}x)`)
        .join(' | ');
    return `**${label}:** ${body}`;
}

function subjectLabel(subject) {
    const labels = {
        general: 'General',
        math: 'Math',
        language: 'Language',
        coding: 'Coding',
        reading: 'Reading',
        exam: 'Exam',
    };
    return labels[subject] || 'General';
}

module.exports.getAdvancedStatsData = getAdvancedStatsData;
module.exports.getTopSubjects = getTopSubjects;
module.exports.getTopSubjectsForWindow = getTopSubjectsForWindow;
