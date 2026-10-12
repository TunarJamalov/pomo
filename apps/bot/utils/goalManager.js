const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    recordGuildGoalContribution,
    recordPersonalGoalContribution,
    recordGuildQuestProgress,
    recordGlobalEventProgress,
} = require('./database');
const { getPremiumStatus } = require('./premiumCheck');
const { Colors } = require('./constants');
const { formatTime } = require('./embeds');

async function addGoalProgress(client, {
    guildId,
    userId,
    minutes,
    sourceType,
    sourceId,
}) {
    try {
        const result = recordGuildGoalContribution(
            guildId,
            userId,
            minutes,
            sourceType,
            sourceId,
        );

        recordGuildQuestProgress({
            guildId,
            userId,
            minutes,
            sourceType,
            sourceId,
        });

        recordGlobalEventProgress({
            guildId,
            userId,
            minutes,
            sourceType,
            sourceId,
        });

        if (result?.justCompleted) {
            await announceGoalComplete(client, result.goal, result.stats);
        }
        await addPersonalGoalProgress(client, {
            userId,
            minutes,
            sourceType,
            sourceId,
        });
        return result;
    } catch (error) {
        console.error(`[GOAL] Failed to record ${sourceType}:${sourceId}:`, error.message);
        return null;
    }
}

async function addPersonalGoalProgress(client, {
    userId,
    minutes,
    sourceType,
    sourceId,
}) {
    try {
        const premium = await getPremiumStatus(client, userId);
        if (!premium.active) return null;

        const result = recordPersonalGoalContribution(
            userId,
            minutes,
            sourceType,
            sourceId,
        );
        if (result?.justCompleted) {
            await announcePersonalGoalComplete(client, userId, result.goal, result.stats);
        }
        return result;
    } catch (error) {
        console.error(`[MYGOAL] Failed to record ${sourceType}:${sourceId}:`, error.message);
        return null;
    }
}

async function announcePersonalGoalComplete(client, userId, goal, stats) {
    if (!client?.users) return;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    const label = goal.period_type === 'monthly' ? 'Monthly' : 'Weekly';
    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`${label} Personal Goal Complete!`)
        .setDescription(
            `You reached **${formatTime(goal.target_minutes)}** of focused study time.\n\n` +
            `Final progress: **${formatTime(stats.total_minutes)}**\n` +
            `Completed sessions: **${stats.sessions}**\n\n` +
            'Your next goal period will begin automatically.'
        )
        .setFooter({ text: `${goal.period_start} to ${goal.period_end} (UTC)` })
        .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => {});
}

async function announceGoalComplete(client, goal, stats) {
    if (!goal.channel_id) return;
    const channel = await client.channels.fetch(goal.channel_id).catch(() => null);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('Weekly Server Goal Complete!')
        .setDescription(
            `The server reached **${formatTime(goal.target_minutes)}** of focused study time.\n\n` +
            `Contributors: **${stats.contributors}**\n` +
            `Final progress: **${formatTime(stats.total_minutes)}**\n\n` +
            `Members with at least **${formatTime(goal.min_contribution)}** contributed can use ` +
            '`/goal claim` to collect the weekly reward before the next Monday reset.'
        )
        .addFields({
            name: 'Reward',
            value: `+${goal.reward_water} water and +${goal.reward_xp} XP`,
            inline: true,
        })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('View PomoBot')
            .setStyle(ButtonStyle.Link)
            .setURL('https://pomofocus.online'),
    );

    await channel.send({ embeds: [embed], components: [row] }).catch(error => {
        console.error(`[GOAL] Completion announcement failed for guild ${goal.guild_id}:`, error.message);
    });
}

module.exports = {
    addGoalProgress,
    addPersonalGoalProgress,
    announceGoalComplete,
    announcePersonalGoalComplete,
};
