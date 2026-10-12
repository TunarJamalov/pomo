const cron = require('node-cron');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { db } = require('./database');
const { t, getUserLanguage } = require('./i18n');

function initDailyHabitsJob(client) {
    // 1. Morning Intention Prompt (Runs at 08:00 UTC)
    // Send to users who have a streak > 0, played recently, and have reminders_enabled ON
    cron.schedule('0 8 * * *', async () => {
        console.log('[HABITS] Running Morning Intention Prompt...');
        const rows = db.prepare(`
            SELECT u.discord_id, u.streak 
            FROM users u
            JOIN settings s ON u.discord_id = s.user_id
            WHERE u.streak > 0 
              AND s.reminders_enabled = 1 
              AND s.morning_prompt = 1
              AND u.last_session_at >= datetime('now', '-2 days')
        `).all();

        let count = 0;
        for (const row of rows) {
            try {
                const user = await client.users.fetch(row.discord_id).catch(() => null);
                if (!user) continue;
                const language = getUserLanguage(row.discord_id);

                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('set_daily_goal')
                        .setLabel(t(language, 'habitsSetGoalButton'))
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setLabel(t(language, 'habitsStartFocusButton'))
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://discord.com/channels/@me') // Generic link, could deep link to their server
                );

                await user.send({
                    content: t(language, 'habitsMorningBody', { username: user.username, streak: row.streak }),
                    components: [buttons]
                });
                count++;
                await new Promise(r => setTimeout(r, 1000)); // rate limit protection
            } catch(e) {}
        }
        console.log(`[HABITS] Morning prompts sent to ${count} users.`);
    }, { timezone: 'UTC' });

    // 2. Streak Danger Alert (Runs at 20:00 UTC)
    // Send to users who have a streak >= 3, haven't studied today, and have reminders_enabled ON
    cron.schedule('0 20 * * *', async () => {
        console.log('[HABITS] Running Streak Danger Alert...');
        const rows = db.prepare(`
            SELECT u.discord_id, u.streak 
            FROM users u
            JOIN settings s ON u.discord_id = s.user_id
            WHERE u.streak >= 3 
              AND s.reminders_enabled = 1 
              AND s.evening_alert = 1
              AND date(u.last_session_at) != date('now')
              AND u.last_session_at >= datetime('now', '-2 days')
        `).all();

        let count = 0;
        for (const row of rows) {
            try {
                const user = await client.users.fetch(row.discord_id).catch(() => null);
                if (!user) continue;
                const language = getUserLanguage(row.discord_id);

                const embed = new EmbedBuilder()
                    .setColor('#ed4245') // Red for danger
                    .setTitle(t(language, 'habitsStreakDangerTitle'))
                    .setDescription(t(language, 'habitsStreakDangerBody', { streak: row.streak }));

                await user.send({ embeds: [embed] });
                count++;
                await new Promise(r => setTimeout(r, 1000));
            } catch(e) {}
        }
        console.log(`[HABITS] Evening streak alerts sent to ${count} users.`);
    }, { timezone: 'UTC' });

    // 3. Evening Reflection Card (Runs at 21:00 UTC)
    // Send to users who studied TODAY and have reminders_enabled ON
    cron.schedule('0 21 * * *', async () => {
        console.log('[HABITS] Running Evening Reflection Card...');
        const rows = db.prepare(`
            SELECT u.discord_id, u.streak, u.total_focus_minutes 
            FROM users u
            JOIN settings s ON u.discord_id = s.user_id
            WHERE date(u.last_session_at) = date('now')
              AND s.reminders_enabled = 1
              AND s.evening_reflection = 1
        `).all();

        const { AttachmentBuilder } = require('discord.js');
        const { generateEveningReflectionCard } = require('./canvas'); // We need to create this!

        let count = 0;
        for (const row of rows) {
            try {
                const user = await client.users.fetch(row.discord_id).catch(() => null);
                if (!user) continue;

                // Sum today's minutes
                const todayMins = db.prepare(`
                    SELECT sum(duration) as mins 
                    FROM study_sessions 
                    WHERE user_id = ? AND date(started_at) = date('now') AND completed = 1 AND title != '__break__'
                `).get(row.discord_id)?.mins || 0;

                if (todayMins === 0) continue;
                const language = getUserLanguage(row.discord_id);

                const buffer = await generateEveningReflectionCard(user, {
                    todayMins,
                    streak: row.streak,
                    totalMins: row.total_focus_minutes,
                    language
                });
                
                const attachment = new AttachmentBuilder(buffer, { name: 'evening-reflection.png' });
                await user.send({
                    content: t(language, 'habitsEveningBody', { username: user.username }),
                    files: [attachment]
                });
                count++;
                await new Promise(r => setTimeout(r, 1000));
            } catch(e) { console.error(e) }
        }
        console.log(`[HABITS] Evening reflections sent to ${count} users.`);
    }, { timezone: 'UTC' });
}

module.exports = { initDailyHabitsJob };
