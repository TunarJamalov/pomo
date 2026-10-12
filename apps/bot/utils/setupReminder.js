const cron = require('node-cron');
const {
    EmbedBuilder,
} = require('discord.js');
const {
    getSetupReminderCandidates,
    markSetupReminderAttempt,
    getSetupNudgeCandidates,
    markSetupNudgeSent,
} = require('./database');
const { findWelcomeChannel } = require('../events/guildCreate');
const { Colors } = require('./constants');
const {
    buildSetupButtonRow,
    formatSetupChecklist,
    formatSetupNextAction,
    getSetupRecommendation,
    buildSetupNudgeEmbed,
} = require('./setupWizard');

const DAILY_BATCH_SIZE = 10;
const DAILY_NUDGE_BATCH_SIZE = 25;

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

        const message = await channel.send({ embeds: [embed], components: [buildSetupButtonRow()] }).catch(() => null);
        markSetupReminderAttempt(candidate.guild_id, Boolean(message));
        if (message) sent++;
    }

    if (candidates.length > 0) {
        console.log(`[SETUP] Reminder batch finished: ${sent}/${candidates.length} sent.`);
    }
    return { candidates: candidates.length, sent };
}

function startSetupReminderJob(client) {
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
            components: [buildSetupButtonRow()],
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
    runSetupReminders,
    runSetupNudges,
    startSetupReminderJob,
};
