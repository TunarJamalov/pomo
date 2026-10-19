const cron = require('node-cron');
const {
    EmbedBuilder,
} = require('discord.js');
const {
    getSetupReminderCandidates,
    markSetupReminderAttempt,
    getSetupNudgeCandidates,
    markSetupNudgeSent,
    getSetupFollowupCandidates,
    markSetupFollowupSent,
    getOrCreateGuildSettings,
} = require('./database');
const { normalizeLanguage, t } = require('./i18n');
const { findWelcomeChannel } = require('../events/guildCreate');
const { Colors } = require('./constants');
const {
    buildSetupButtonRow,
    formatSetupChecklist,
    formatSetupNextAction,
    getSetupRecommendation,
    buildSetupNudgeEmbed,
} = require('./setupWizard');

const DAILY_BATCH_SIZE = 40;
const DAILY_NUDGE_BATCH_SIZE = 25;
const HOURLY_FOLLOWUP_BATCH_SIZE = 40;

async function runSetupReminders(client, limit = DAILY_BATCH_SIZE) {
    const candidates = getSetupReminderCandidates(limit);
    let sent = 0;

    for (const candidate of candidates) {
        const guild = client.guilds.cache.get(candidate.guild_id)
            || await client.guilds.fetch(candidate.guild_id).catch(() => null);
        if (!guild) {
            markSetupReminderAttempt(candidate.guild_id, false);
            continue;
        }

        const channel = findWelcomeChannel(guild);
        if (!channel) {
            markSetupReminderAttempt(candidate.guild_id, false);
            continue;
        }

        const recommendation = getSetupRecommendation(candidate);
        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(recommendation.title)
            .setDescription(
                'Members can already use `/study`, `/pomodoro`, `/team`, `/guide`, and `/garden`.\n\n' +
                `${recommendation.body}\n\n` +
                `${recommendation.impact}\n\n` +
                '**Click Configure Server** to finish the remaining setup steps, then use **Post Guide Panel** to show members how to start. ' +
                'After members start studying, use `/serverstats` to see activity.\n\n' +
                'This is a one-time reminder.'
            )
            .addFields(
                {
                    name: 'What is missing',
                    value: formatSetupChecklist(candidate),
                    inline: false,
                },
                {
                    name: 'Recommended next step',
                    value: formatSetupNextAction(candidate),
                    inline: false,
                },
            )
            .setTimestamp();

        const message = await channel.send({ embeds: [embed], components: [buildSetupButtonRow(null, 'en', guild)] }).catch(() => null);
        markSetupReminderAttempt(candidate.guild_id, Boolean(message));
        if (message) sent++;
    }

    if (candidates.length > 0) {
        console.log(`[SETUP] Reminder batch finished: ${sent}/${candidates.length} sent.`);
    }
    return { candidates: candidates.length, sent };
}

/**
 * One day after joining, servers that turned on nothing get one short message
 * with the setup buttons. Runs hourly because the window is only 20-72 hours.
 */
async function runSetupFollowups(client, limit = HOURLY_FOLLOWUP_BATCH_SIZE) {
    const candidates = getSetupFollowupCandidates(limit);
    let sent = 0;

    for (const candidate of candidates) {
        const guild = client.guilds.cache.get(candidate.guild_id)
            || await client.guilds.fetch(candidate.guild_id).catch(() => null);
        if (!guild) {
            markSetupFollowupSent(candidate.guild_id);
            continue;
        }
        const channel = findWelcomeChannel(guild);
        // Same choice as the welcome message: an admin-chosen language, else the server's locale
        const settingsLanguage = getOrCreateGuildSettings(guild.id)?.language;
        const language = normalizeLanguage(settingsLanguage && settingsLanguage !== 'en' ? settingsLanguage : guild.preferredLocale || 'en');
        const message = channel ? await channel.send({
            embeds: [new EmbedBuilder()
                .setColor(Colors.SUCCESS)
                .setTitle(t(language, 'setupFollowupTitle'))
                .setDescription(t(language, 'setupFollowupBody'))],
            components: [buildSetupButtonRow(null, language, guild)],
        }).catch(() => null) : null;
        // Marked even when it could not be posted, so a server is never retried hourly
        markSetupFollowupSent(candidate.guild_id);
        if (message) sent++;
    }

    if (candidates.length > 0) {
        console.log(`[SETUP] Day-1 follow-up batch finished: ${sent}/${candidates.length} sent.`);
    }
    return { candidates: candidates.length, sent };
}

function startSetupReminderJob(client) {
    cron.schedule('15 * * * *', () => {
        runSetupFollowups(client).catch(error => {
            console.error('[SETUP] Follow-up job failed:', error.message);
        });
    }, { timezone: 'UTC' });

    cron.schedule('0 12 * * *', () => {
        runSetupReminders(client).catch(error => {
            console.error('[SETUP] Reminder job failed:', error.message);
        });
    }, { timezone: 'UTC' });

    cron.schedule('0 18 * * *', () => {
        runSetupNudges(client).catch(error => {
            console.error('[SETUP] Nudge job failed:', error.message);
        });
    }, { timezone: 'UTC' });
}

/**
 * Proactively nudge active-but-unconfigured servers. These servers already
 * have study activity, so nudging them scales the highest-converting setup
 * lever beyond the on-demand (admin-ran-command) path.
 */
async function runSetupNudges(client, limit = DAILY_NUDGE_BATCH_SIZE) {
    const candidates = getSetupNudgeCandidates(limit);
    let sent = 0;

    for (const candidate of candidates) {
        const guild = client.guilds.cache.get(candidate.guild_id)
            || await client.guilds.fetch(candidate.guild_id).catch(() => null);
        if (!guild) continue;

        const channel = findWelcomeChannel(guild);
        if (!channel) continue;

        const embed = buildSetupNudgeEmbed(candidate);
        const message = await channel.send({
            embeds: [embed],
            components: [buildSetupButtonRow(null, 'en', guild)],
        }).catch(() => null);

        if (message) {
            markSetupNudgeSent(candidate.guild_id);
            sent++;
        }
    }

    if (candidates.length > 0) {
        console.log(`[SETUP] Nudge batch finished: ${sent}/${candidates.length} sent.`);
    }
    return { candidates: candidates.length, sent };
}

module.exports = {
    DAILY_BATCH_SIZE,
    DAILY_NUDGE_BATCH_SIZE,
    HOURLY_FOLLOWUP_BATCH_SIZE,
    runSetupFollowups,
    runSetupReminders,
    runSetupNudges,
    startSetupReminderJob,
};
