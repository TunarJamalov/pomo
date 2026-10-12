const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, GardenPlotLimits, PRO_STREAK_SHIELDS } = require('../utils/constants');

// ~1-1.5 s per user (fetch + DM + 1 s pause) must finish inside the 15-minute token
const MAX_BATCH = 400;
const { db, getOrCreateUser } = require('../utils/database');
const { grantProAccess } = require('../utils/premiumManager');
const { t, getUserLanguage } = require('../utils/i18n');

module.exports = {
    ownerOnly: true,
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('reactivate')
        .setDescription('[OWNER ONLY] Send a reactivation DM to inactive users and grant free Pro')
        .addIntegerOption(opt => 
            opt.setName('days')
                .setDescription('Users inactive for this many days (e.g., 15)')
                .setRequired(true)
        )
        .addIntegerOption(opt => 
            opt.setName('limit')
                .setDescription('Max users to DM in this batch (prevent spam limits)')
                .setRequired(true)
        ),
        
    async execute(interaction) {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: '❌ You do not have permission to run this command.', flags: 64 });
        }

        const days = interaction.options.getInteger('days');
        const limit = Math.min(Math.max(interaction.options.getInteger('limit'), 1), MAX_BATCH);

        await interaction.deferReply({ flags: 64 });

        // Inactive users without Pro who have never received this gift before
        const inactiveUsers = db.prepare(`
            SELECT u.discord_id, u.last_study_date
            FROM users u
            WHERE julianday('now') - julianday(u.last_study_date) >= ?
              AND COALESCE(u.premium, 0) = 0
              AND NOT EXISTS (
                  SELECT 1 FROM premium_entitlements pe
                  WHERE pe.user_id = u.discord_id AND pe.status = 'active'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM premium_events ev
                  WHERE ev.user_id = u.discord_id AND ev.source = 'campaign'
              )
            ORDER BY u.last_study_date DESC
            LIMIT ?
        `).all(days, limit);

        if (inactiveUsers.length === 0) {
            return interaction.editReply(`No users found who have been inactive for ${days}+ days without Premium.`);
        }

        let successCount = 0;
        let failCount = 0;

        for (const userRow of inactiveUsers) {
            const discordId = userRow.discord_id;
            
            try {
                // 1. Grant 3 Days of Pro using the same system as /premiumadmin
                grantProAccess(discordId, 3, 'wave2_reactivation_campaign', { source: 'campaign' });
                
                // 2. Send the DM
                const userObj = await interaction.client.users.fetch(discordId).catch(() => null);
                if (userObj) {
                    const language = getUserLanguage(discordId);
                    const embed = new EmbedBuilder()
                        .setColor(Colors.STUDY)
                        .setTitle(t(language, 'reactivateDmTitle'))
                        .setDescription(t(language, 'reactivateDmBody', {
                            username: userObj.username,
                            shields: PRO_STREAK_SHIELDS,
                            plots: GardenPlotLimits.PRO,
                        }))
                        .setFooter({ text: t(language, 'reactivateDmFooter') });

                    await userObj.send({ embeds: [embed] });
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (err) {
                // User probably has DMs closed
                failCount++;
            }
            
            // Wait 1 second between DMs to avoid Discord rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle('🚀 Reactivation Campaign Complete')
            .setDescription(`Targeted users inactive for **${days}+ days**.`)
            .addFields(
                { name: 'Total Attempted', value: `${inactiveUsers.length}`, inline: true },
                { name: 'Successfully DMed', value: `${successCount}`, inline: true },
                { name: 'Failed (DMs Closed)', value: `${failCount}`, inline: true }
            );

        await interaction.editReply({ embeds: [embed] });
    }
};
