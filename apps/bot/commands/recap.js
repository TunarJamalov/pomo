const {
    SlashCommandBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { getOrCreateUser, db } = require('../utils/database');
const { generateWeeklyRecap } = require('../utils/canvas');
const { getBotInviteUrl } = require('../utils/invite');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('recap')
        .setDescription('Generate a shareable recap of your last 7 focus days'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        await interaction.deferReply();
        const user = getOrCreateUser(interaction.user.id);
        const recap = getWeeklyRecapData(interaction.user.id);

        try {
            const buffer = await generateWeeklyRecap(interaction.user, user, recap, language);
            const attachment = new AttachmentBuilder(buffer, {
                name: `pomobot_weekly_recap_${recap.endDate}.png`,
            });
            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel(t(language, 'recapAddBotButton'))
                    .setStyle(ButtonStyle.Link)
                    .setURL(getBotInviteUrl()),
                new ButtonBuilder()
                    .setLabel(t(language, 'recapDashboardButton'))
                    .setStyle(ButtonStyle.Link)
                    .setURL('https://pomofocus.online/dashboard'),
            );

            return interaction.editReply({
                content: recap.periodMinutes > 0
                    ? t(language, 'recapReadyBody', { sessions: recap.periodSessions, days: recap.activeDays })
                    : t(language, 'recapEmptyBody'),
                files: [attachment],
                components: [buttons],
            });
        } catch (error) {
            console.error('[RECAP] Canvas error:', error);
            return interaction.editReply(t(language, 'recapFailedBody'));
        }
    },
};

function getWeeklyRecapData(userId, now = new Date()) {
    const end = new Date(now);
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const rows = db.prepare(`
        WITH focus AS (
            SELECT date(started_at) AS focus_date, duration AS minutes, 'solo' AS source
            FROM study_sessions
            WHERE user_id = ?
              AND completed = 1
              AND title != '__break__'
              AND date(started_at) BETWEEN ? AND ?

            UNION ALL

            SELECT date(ts.started_at), ts.duration, 'team'
            FROM team_members tm
            JOIN team_sessions ts ON ts.id = tm.session_id
            WHERE tm.user_id = ?
              AND ts.status = 'completed'
              AND date(ts.started_at) BETWEEN ? AND ?

            UNION ALL

            SELECT date(ended_at), credited_minutes, 'voice'
            FROM voice_sessions
            WHERE user_id = ?
              AND status = 'completed'
              AND credited_minutes > 0
              AND date(ended_at) BETWEEN ? AND ?
        )
        SELECT focus_date AS date, source, COUNT(*) AS sessions, SUM(minutes) AS minutes
        FROM focus
        GROUP BY focus_date, source
        ORDER BY focus_date ASC
    `).all(
        userId, startDate, endDate,
        userId, startDate, endDate,
        userId, startDate, endDate,
    );

    const dayMap = new Map();
    const sources = { solo: 0, team: 0, voice: 0 };
    for (const row of rows) {
        const current = dayMap.get(row.date) || { sessions: 0, minutes: 0 };
        current.sessions += row.sessions;
        current.minutes += row.minutes;
        dayMap.set(row.date, current);
        sources[row.source] += row.sessions;
    }

    const days = [];
    for (let index = 0; index < 7; index++) {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        const key = date.toISOString().slice(0, 10);
        const value = dayMap.get(key) || { sessions: 0, minutes: 0 };
        days.push({
            date: key,
            dayName: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }),
            sessions: value.sessions,
            minutes: value.minutes,
        });
    }

    const periodSessions = days.reduce((sum, day) => sum + day.sessions, 0);
    const periodMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
    const bestDay = days.reduce((best, day) => day.minutes > best.minutes ? day : best, days[0]);

    return {
        startDate,
        endDate,
        days,
        sources,
        periodSessions,
        periodMinutes,
        activeDays: days.filter(day => day.minutes > 0).length,
        avgLength: periodSessions > 0 ? Math.round(periodMinutes / periodSessions) : 0,
        bestDay,
    };
}

module.exports.getWeeklyRecapData = getWeeklyRecapData;
