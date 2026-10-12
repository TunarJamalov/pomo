const cron = require('node-cron');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreateUser } = require('./database');
const { generateWeeklyRecap } = require('./canvas');
const { getWeeklyRecapData } = require('../commands/recap');
const { t, getUserLanguage } = require('./i18n');

function initWeeklyWrappedJob(client) {
    // Run every Sunday at 18:00 UTC
    cron.schedule('0 18 * * 0', async () => {
        console.log('[WRAPPED] Starting weekly focus wrapped job...');
        
        // Find users who have studied at least 60 minutes in the last 7 days
        const rows = db.prepare(`
            SELECT DISTINCT user_id 
            FROM study_sessions 
            WHERE completed = 1 
              AND started_at >= datetime('now', '-7 days')
        `).all();

        console.log(`[WRAPPED] Found ${rows.length} active users to check for weekly wrapped.`);

        let sentCount = 0;
        
        for (const row of rows) {
            try {
                const userId = row.user_id;
                const recap = getWeeklyRecapData(userId);
                
                // Only send if they had significant activity (e.g. > 60 minutes) to avoid spam
                if (recap.periodMinutes < 60) continue;
                
                
                const user = getOrCreateUser(userId);
                
                // Check if user has disabled notifications
                const { getOrCreateSettings } = require('./database');
                const settings = getOrCreateSettings(userId);
                if (settings.reminders_enabled === 0) continue;

                const discordUser = await client.users.fetch(userId).catch(() => null);
                if (!discordUser) continue;
                const language = getUserLanguage(userId);
                
                const buffer = await generateWeeklyRecap(discordUser, user, recap, language);
                const attachment = new AttachmentBuilder(buffer, {
                    name: `pomobot_weekly_recap.png`,
                });
                
                const buttons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel(t(language, 'wrappedDashboardButton'))
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://pomofocus.online/dashboard'),
                );
                
                const content = t(language, 'wrappedDmBody', { minutes: recap.periodMinutes, sessions: recap.periodSessions });
                
                await discordUser.send({
                    content,
                    files: [attachment],
                    components: [buttons]
                });
                
                sentCount++;
                
                // Wait 1 second between DMs to avoid Discord rate limits
                await new Promise(r => setTimeout(r, 1000));
            } catch (err) {
                // Ignore if DMs are closed
            }
        }
        
        console.log(`[WRAPPED] Weekly focus wrapped job finished. DMs sent: ${sentCount}`);
    }, { timezone: 'UTC' });
}

module.exports = { initWeeklyWrappedJob };
