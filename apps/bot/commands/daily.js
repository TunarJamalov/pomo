/**
 * /daily — Claim your daily water reward (once per 24 hours).
 * Premium users get a second /daily with bigger rewards.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Colors, Plants } = require('../utils/constants');
const { getOrCreateUser, updateUser, incrementUser, db } = require('../utils/database');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { isPremium } = require('../utils/premiumCheck');

/**
 * Pick 1-2 random fruits weighted toward common crops (normal daily).
 */
function getRandomFruits() {
    const weights = { carrot: 50, tomato: 30, potato: 15, apple: 5 };
    const pool = [];
    for (const [key, w] of Object.entries(weights)) {
        for (let i = 0; i < w; i++) pool.push(key);
    }
    const count = Math.random() < 0.4 ? 2 : 1; // 40% chance of 2 fruits
    const fruits = {};
    for (let i = 0; i < count; i++) {
        const key = pool[Math.floor(Math.random() * pool.length)];
        fruits[key] = (fruits[key] || 0) + 1;
    }
    return fruits;
}

/**
 * Pick 5-8 random fruits for premium daily (all fruits available, better variety).
 */
function getPremiumRandomFruits() {
    const allKeys = Object.keys(Plants);
    const count = 5 + Math.floor(Math.random() * 4); // 5 to 8
    const fruits = {};
    for (let i = 0; i < count; i++) {
        const key = allKeys[Math.floor(Math.random() * allKeys.length)];
        fruits[key] = (fruits[key] || 0) + 1;
    }
    return fruits;
}

function grantFruitsToUser(userId, fruits) {
    for (const [key, qty] of Object.entries(fruits)) {
        db.prepare(`
            INSERT INTO inventory (user_id, item_key, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity
        `).run(userId, key, qty);
    }
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily water reward')
        .addBooleanOption(opt =>
            opt.setName('premium')
                .setDescription('Claim your premium daily reward (Premium only)')
                .setRequired(false)
        ),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = getOrCreateUser(userId);
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const wantsPremium = interaction.options.getBoolean('premium') ?? false;

        // ── Premium Daily ────────────────────────────────────────────
        if (wantsPremium) {
            const premium = await isPremium(interaction.client, userId);
            if (!premium) {
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('⭐ Get Premium')
                        .setStyle(ButtonStyle.Link)
                        .setURL('https://boosty.to/pomobot')
                );
                return interaction.reply({
                    embeds: [errorEmbed(
                        '⭐ Premium Only',
                        'The premium daily is exclusive to **PomoBot Premium** members.\n\nGet premium to unlock:\n✅ 2nd daily with **5–8 extra fruits**\n✅ Auto **2x Water Boost**\n✅ **+50% bigger** quest rewards'
                    )],
                    components: [row],
                    flags: 64,
                });
            }

            // Check if already claimed premium daily today
            if (user.last_premium_daily_date === today) {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const diffMs = tomorrow.getTime() - now.getTime();
                const hours = Math.floor(diffMs / (1000 * 60 * 60));
                const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

                return interaction.reply({
                    embeds: [errorEmbed(
                        t(language, 'alreadyClaimedTitle'),
                        `You already claimed your **premium daily** today!\nCome back in **${hours}h ${minutes}m**.`
                    )],
                    flags: 64,
                });
            }

            // Grant premium daily rewards
            const premiumWater = 5;
            incrementUser(userId, 'water', premiumWater);
            updateUser(userId, { last_premium_daily_date: today });

            const fruits = getPremiumRandomFruits();
            grantFruitsToUser(userId, fruits);
            const freshUser = getOrCreateUser(userId);

            const fruitLines = Object.entries(fruits)
                .map(([k, qty]) => `${Plants[k].emoji} **${qty}x ${Plants[k].name}**`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor(0xFFD700) // Gold color for premium
                .setTitle('⭐ Premium Daily Claimed!')
                .setDescription(
                    `+**${premiumWater}** 💧 Water\n${fruitLines}\n\n` +
                    `Your new balance: **${freshUser.water}** 💧`
                )
                .setFooter({ text: 'Premium perk — come back tomorrow for more!' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // ── Normal Daily ─────────────────────────────────────────────
        if (user.last_daily_date === today) {
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const diffMs = tomorrow.getTime() - now.getTime();
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'alreadyClaimedTitle'),
                    t(language, 'dailyAlreadyClaimedBody', { hours, minutes })
                )],
                flags: 64,
            });
        }

        // Award daily water + random fruits
        const waterReward = 3;
        incrementUser(userId, 'water', waterReward);
        updateUser(userId, { last_daily_date: today });

        const fruits = getRandomFruits();
        grantFruitsToUser(userId, fruits);
        const freshUser = getOrCreateUser(userId);

        const fruitLines = Object.entries(fruits)
            .map(([k, qty]) => `${Plants[k].emoji} **${qty}x ${Plants[k].name}**`)
            .join('\n');

        const isPremiumUser = await isPremium(interaction.client, userId);

        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(`🎁 ${t(language, 'dailyClaimedTitle')}`)
            .setDescription(
                `+**${waterReward}** 💧 Water\n${fruitLines}\n\n` +
                `Your new balance: **${freshUser.water}** 💧`
            )
            .setFooter({ text: isPremiumUser ? '⭐ Use /daily premium to claim your bonus premium daily!' : '⭐ Premium members get a 2nd daily with 5–8 extra fruits!' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};
