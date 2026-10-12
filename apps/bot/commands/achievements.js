/**
 * /achievements - View your unlocked achievements.
 * Categorized display with locked/unlocked status.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Achievements } = require('../utils/constants');
const { getOrCreateUser } = require('../utils/database');
const { getUserAchievements } = require('../utils/achievementChecker');
const { getInteractionLanguage, t } = require('../utils/i18n');

const CATEGORY_KEYS = {
    Time: 'achievementCategoryTime',
    Consistency: 'achievementCategoryConsistency',
    Volume: 'achievementCategoryVolume',
    Social: 'achievementCategorySocial',
    Garden: 'achievementCategoryGarden',
};

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('View your achievements')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s achievements')
                .setRequired(false)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const userId = targetUser.id;
        getOrCreateUser(userId);

        const unlocked = getUserAchievements(userId);
        const unlockedKeys = new Set(unlocked.map(a => a.achievement_key));
        const totalAchievements = Object.keys(Achievements).length;
        const unlockedCount = unlockedKeys.size;

        const categoryOrder = ['Time', 'Consistency', 'Volume', 'Social', 'Garden'];
        const grouped = {};

        for (const [key, ach] of Object.entries(Achievements)) {
            if (!grouped[ach.category]) {
                grouped[ach.category] = [];
            }
            grouped[ach.category].push({
                ...ach,
                unlocked: unlockedKeys.has(key),
            });
        }

        let description =
            `**${t(language, 'achievementsTotalProgress')}:** ` +
            `${unlockedCount}/${totalAchievements} ${t(language, 'achievementsUnlocked')}\n\n`;

        for (const category of categoryOrder) {
            const items = grouped[category];
            if (!items) continue;

            const catEmoji = items[0].categoryEmoji;
            const categoryLabel = t(language, CATEGORY_KEYS[category] || category);
            description += `**${catEmoji} ${categoryLabel}**\n`;

            for (const item of items) {
                if (item.unlocked) {
                    description += `${item.emoji} **${item.name}** *(${item.description})*\n`;
                } else {
                    description += `🔒 ${item.name} *(${item.description})*\n`;
                }
            }
            description += '\n';
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.MARKET)
            .setTitle(`🏆 ${t(language, 'achievementsTitle', { username: targetUser.username })}`)
            .setDescription(description)
            .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
            .setFooter({
                text: t(language, 'achievementsFooter', {
                    unlocked: unlockedCount,
                    total: totalAchievements,
                }),
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
