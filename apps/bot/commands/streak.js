const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getOrCreateUser,
    getStreakRecoveryStatus,
    recoverStreak,
    recoverStreakWithWater,
} = require('../utils/database');
const { getPremiumStatus } = require('../utils/premiumCheck');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('streak')
        .setDescription('Manage your Pomo streak recovery')
        .addSubcommand(option =>
            option.setName('status')
                .setDescription('Check your streak and recovery availability'))
        .addSubcommand(option =>
            option.setName('recover')
                .setDescription('Restore a recently broken streak (Pro feature)'))
        .addSubcommand(option =>
            option.setName('repair')
                .setDescription('Restore a broken streak using Water (50 Water)')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        await interaction.deferReply({ flags: 64 });
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'repair') {
            return handleRepairWithWater(interaction, language);
        }

        const premium = await getPremiumStatus(interaction.client, interaction.user.id);
        if (subcommand === 'recover' && !premium.active) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    t(language, 'proFeatureTitle'),
                    `${t(language, 'streakLockedBody')}\n\n💡 *Tip: You can also use \`/streak repair\` to recover your streak using 💧 50 Water!*`
                )],
            });
        }

        if (subcommand === 'recover') {
            return handleRecover(interaction, language);
        }
        return handleStatus(interaction, language, premium.active);
    },
};

async function handleStatus(interaction, language = getInteractionLanguage(interaction), isPro = false) {
    const user = getOrCreateUser(interaction.user.id);
    const status = getStreakRecoveryStatus(interaction.user.id);
    const streakUnit = user.streak === 1 ? t(language, 'streakDay') : t(language, 'streakDays');
    const embed = new EmbedBuilder()
        .setColor(status.available ? Colors.SUCCESS : Colors.INFO)
        .setTitle(t(language, 'streakRecoveryTitle'))
        .addFields({ name: t(language, 'streakCurrent'), value: `${user.streak} ${streakUnit}`, inline: true })
        .setTimestamp();

    if (status.available) {
        embed
            .setDescription(t(language, 'streakAvailableBody'))
            .addFields(
                { name: t(language, 'streakPrevious'), value: `${status.candidate.previous_streak} ${t(language, 'streakDays')}`, inline: true },
                { name: t(language, 'streakRecoveryExpires'), value: formatTimestamp(status.candidate.expires_at, 'R'), inline: false },
                { name: '💧 Water Repair', value: `Use \`/streak repair\` to restore using **50 Water** (You have: 💧 ${user.water || 0})`, inline: false }
            );
    } else if (status.cooldownActive && isPro) {
        embed.setDescription(
            t(language, 'streakCooldownBody', { time: formatTimestamp(status.cooldownEndsAt, 'R') }) +
            `\n\n💧 *Alternatively, use \`/streak repair\` to restore using 50 Water.*`
        );
    } else {
        embed.setDescription(t(language, 'streakNoRecoverableBody'));
    }

    return interaction.editReply({ embeds: [embed] });
}

async function handleRecover(interaction, language = getInteractionLanguage(interaction)) {
    const result = recoverStreak(interaction.user.id);
    if (!result.ok && result.reason === 'cooldown') {
        return interaction.editReply({
            embeds: [errorEmbed(
                t(language, 'streakCooldownTitle'),
                t(language, 'streakCooldownErrorBody', { time: formatTimestamp(result.cooldownEndsAt, 'R') }) +
                `\n\n💡 *Tip: You can use \`/streak repair\` to restore using 💧 50 Water!*`
            )],
        });
    }
    if (!result.ok) {
        return interaction.editReply({
            embeds: [errorEmbed(
                t(language, 'streakNoRecoverTitle'),
                t(language, 'streakNoRecoverBody')
            )],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed(
            t(language, 'streakRecoveredTitle'),
            t(language, 'streakRecoveredBody', {
                previous: result.previousStreak,
                current: result.restoredStreak,
            })
        )],
    });
}

async function handleRepairWithWater(interaction, language = getInteractionLanguage(interaction)) {
    const result = recoverStreakWithWater(interaction.user.id, 50);

    if (!result.ok && result.reason === 'insufficient_water') {
        return interaction.editReply({
            embeds: [errorEmbed(
                'Insufficient Water',
                `Streak repair costs **💧 50 Water**. You currently have **💧 ${result.userWater} Water**.\n\nComplete focus sessions with \`/study\` or \`/pomodoro\` to earn more Water!`
            )],
        });
    }

    if (!result.ok) {
        return interaction.editReply({
            embeds: [errorEmbed(
                t(language, 'streakNoRecoverTitle'),
                'No recoverable streak break found within the last 48 hours.'
            )],
        });
    }

    return interaction.editReply({
        embeds: [successEmbed(
            '🔥 Streak Restored with Water!',
            `You spent **💧 50 Water** and restored your streak back to **🔥 ${result.restoredStreak} days**!`
        )],
    });
}

function formatTimestamp(value, style) {
    const timestamp = Math.floor(new Date(`${value.replace(' ', 'T')}Z`).getTime() / 1000);
    return `<t:${timestamp}:${style}>`;
}

module.exports.formatTimestamp = formatTimestamp;
