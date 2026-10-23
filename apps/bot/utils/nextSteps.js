/**
 * What to do after a focus session. The session-complete card gets three
 * buttons: start the same session again, open the garden, and "Remind me
 * tomorrow", an opt-in that sends one DM before the streak resets if the user
 * hasn't studied again. Reminders go only to users who pressed the button.
 */
const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateSettings } = require('./database');
const { t, getInteractionLanguage, getUserLanguage } = require('./i18n');

const AGAIN_PREFIX = 'next_again_';

/**
 * Buttons for the session-complete card; the reminder button hides once it is on.
 * Voice summaries pass { again: false }: there is no timer to start again.
 */
function buildNextStepsRow(session, language, { again = true } = {}) {
    const row = new ActionRowBuilder();
    if (again) {
        row.addComponents(new ButtonBuilder()
            .setCustomId(`${AGAIN_PREFIX}${session.id}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('▶️')
            .setLabel(t(language, 'nextAgainButton', { minutes: session.duration })));
    }
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('next_garden')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🌱')
            .setLabel(t(language, 'nextGardenButton')),
    );
    if (!getOrCreateSettings(session.user_id).comeback_reminder) {
        row.addComponents(new ButtonBuilder()
            .setCustomId('next_remind')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔔')
            .setLabel(t(language, 'nextRemindButton')));
    }
    return row;
}

function setComebackReminder(userId, enabled) {
    getOrCreateSettings(userId);
    db.prepare('UPDATE settings SET comeback_reminder = ? WHERE user_id = ?').run(enabled ? 1 : 0, userId);
}

async function handleNextStepButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const { customId } = interaction;

    if (customId.startsWith(AGAIN_PREFIX)) {
        const sessionId = Number(customId.slice(AGAIN_PREFIX.length));
        const session = db.prepare('SELECT user_id, duration, title, subject FROM study_sessions WHERE id = ?').get(sessionId);
        if (!session || session.user_id !== userId) {
            return interaction.reply({ content: t(language, 'nextAgainNotYours'), flags: 64 });
        }
        return require('../commands/study').startStudySession(interaction, {
            minutes: session.duration,
            title: session.title,
            subject: session.subject,
        });
    }

    if (customId === 'next_garden') {
        return require('../commands/garden').sendGardenView(interaction, userId, false, language);
    }

    if (customId === 'next_remind') {
        setComebackReminder(userId, true);
        return interaction.reply({ content: t(language, 'nextRemindOnBody'), flags: 64 });
    }

    if (customId === 'next_remind_off') {
        setComebackReminder(userId, false);
        return interaction.reply({ content: t(language, 'nextRemindOffBody') });
    }
    return null;
}

/**
 * Users to remind now: opted in, last session at least 20 hours ago, today
 * (UTC) is the day after it, so the streak is still alive but ends tonight,
 * and not reminded since that session. Marks them as reminded.
 */
function takeDueComebackReminders(nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ')) {
    return db.transaction(() => {
        const rows = db.prepare(`
            SELECT u.discord_id AS userId, u.streak
            FROM users u JOIN settings s ON s.user_id = u.discord_id
            WHERE s.comeback_reminder = 1
              AND u.last_session_at IS NOT NULL
              AND u.last_session_at <= datetime(?, '-20 hours')
              AND date(?) = date(u.last_session_at, '+1 day')
              AND (s.comeback_reminded_at IS NULL OR s.comeback_reminded_at < u.last_session_at)
        `).all(nowIso, nowIso);
        const mark = db.prepare('UPDATE settings SET comeback_reminded_at = ? WHERE user_id = ?');
        for (const row of rows) mark.run(nowIso, row.userId);
        return rows;
    })();
}

function startComebackReminderJob(client) {
    cron.schedule('*/15 * * * *', async () => {
        try {
            const due = takeDueComebackReminders();
            for (const { userId, streak } of due) {
                const language = getUserLanguage(userId);
                const endOfDay = new Date();
                endOfDay.setUTCHours(24, 0, 0, 0);
                const off = new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId('next_remind_off')
                    .setStyle(ButtonStyle.Secondary)
                    .setLabel(t(language, 'comebackReminderOffButton')));
                await client.users.fetch(userId)
                    .then(user => user.send({
                        content: t(language, 'comebackReminderDm', {
                            streak: Math.max(1, streak || 1),
                            next: Math.max(1, streak || 1) + 1,
                            ends: `<t:${Math.floor(endOfDay.getTime() / 1000)}:R>`,
                        }),
                        components: [off],
                    }))
                    .catch(() => {});
                // One DM at a time, so a batch can't burst
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            if (due.length) console.log(`[NEXT] Comeback reminders sent to ${due.length} users.`);
        } catch (err) {
            console.error('[NEXT] Comeback reminder job error:', err.message);
        }
    }, { timezone: 'UTC' });
    console.log('[NEXT] Comeback reminder job started.');
}

module.exports = {
    buildNextStepsRow,
    handleNextStepButton,
    setComebackReminder,
    takeDueComebackReminders,
    startComebackReminderJob,
};
