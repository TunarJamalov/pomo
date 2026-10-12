/**
 * /snack — Craft and consume study snacks for temporary buffs.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
} = require('discord.js');
const { Colors, StudySnacks, Plants } = require('../utils/constants');
const { errorEmbed } = require('../utils/embeds');
const { getOrCreateUser, db, transactionManager, inventoryRepository, userRepository, identityRepository } = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('snack')
        .setDescription('Craft and eat study snacks for buffs'),

    async execute(interaction) {
        const userId = interaction.user.id;
        await sendSnackView(interaction, userId, false, getInteractionLanguage(interaction));
    },
};

async function sendSnackView(interaction, userId, isUpdate, language = getInteractionLanguage(interaction)) {
    const user = getOrCreateUser(userId);
    
    // Get user's crafted snacks from inventory
    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
    const userSnacks = inventory.filter(i => i.item_key.startsWith('snack_') && i.quantity > 0);

    let display = `**Your Snacks:**\n`;
    if (userSnacks.length === 0) {
        display += `*You don't have any snacks. Use crops from your garden to craft some!*\n`;
    } else {
        userSnacks.forEach(snack => {
            const snackKey = snack.item_key.replace('snack_', '');
            const snackDef = StudySnacks[snackKey];
            if (snackDef) {
                display += `${snackDef.emoji} **${snackDef.name}** x${snack.quantity}\n`;
            }
        });
    }

    // Display active buff if any
    if (user.active_buff_type && user.buff_expires_at) {
        const expiresAt = new Date(user.buff_expires_at);
        if (expiresAt > new Date()) {
            display += `\n**Active Buff:**\n`;
            // Find the snack that gives this buff
            const activeSnack = Object.values(StudySnacks).find(s => s.buffType === user.active_buff_type && s.buffValue === user.active_buff_value);
            if (activeSnack) {
                display += `${activeSnack.emoji} **${activeSnack.name}**: ${activeSnack.description}\n`;
                display += `*Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>*\n`;
            }
        }
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle('🍲 Study Snacks')
        .setDescription(display)
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('snack_craft')
            .setLabel('Craft Snack')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🍳'),
        new ButtonBuilder()
            .setCustomId('snack_eat')
            .setLabel('Eat Snack')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🤤')
            .setDisabled(userSnacks.length === 0),
    );

    const payload = { embeds: [embed], components: [row] };

    if (isUpdate) {
        await interaction.update(payload);
    } else {
        payload.flags = 64; 
        await interaction.reply(payload);
    }
}

async function handleCraftButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    
    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
    
    // Create options for all craftable snacks
    const options = Object.entries(StudySnacks).map(([key, snack]) => {
        // Build recipe string
        const recipeParts = [];
        let canCraft = true;
        for (const [cropKey, amount] of Object.entries(snack.recipe)) {
            const crop = Plants[cropKey];
            const hasCrop = inventory.find(i => i.item_key === cropKey)?.quantity || 0;
            if (hasCrop < amount) canCraft = false;
            recipeParts.push(`${amount} ${crop.emoji}`);
        }
        
        return {
            label: snack.name + (canCraft ? '' : ' (Missing crops)'),
            value: key,
            emoji: snack.emoji,
            description: `${recipeParts.join(', ')} -> ${snack.description}`,
        };
    });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('snack_select_craft')
            .setPlaceholder('Choose a snack to craft')
            .addOptions(options)
    );

    await interaction.reply({ content: `🍳 **Select a snack to craft:**\nMake sure you have harvested the required crops from your garden!`, components: [row], flags: 64 });
}

async function handleCraftSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const snackKey = interaction.values[0];
    const snack = StudySnacks[snackKey];

    if (!snack) {
        return interaction.update({ content: `❌ Invalid snack.`, components: [] });
    }

    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
    
    // Check if user has required crops
    for (const [cropKey, amount] of Object.entries(snack.recipe)) {
        const hasCrop = inventory.find(i => i.item_key === cropKey)?.quantity || 0;
        if (hasCrop < amount) {
            return interaction.update({ content: `❌ You don't have enough ${Plants[cropKey].emoji} ${Plants[cropKey].name} to craft ${snack.emoji} **${snack.name}**.`, components: [] });
        }
    }

    // Deduct crops and add snack atomically
    try {
        await transactionManager.execute(async (ctx) => {
            for (const [cropKey, amount] of Object.entries(snack.recipe)) {
                const success = await inventoryRepository.removeItem(userId, cropKey, amount, ctx);
                if (!success) throw new Error('INSUFFICIENT_INVENTORY');
            }
            await inventoryRepository.addItem(userId, `snack_${snackKey}`, 1, ctx);
        });
    } catch (err) {
        return interaction.update({ content: `❌ Crafting failed (maybe you ran out of crops concurrently).`, components: [] });
    }

    await interaction.update({
        content: `🍳 You successfully crafted a ${snack.emoji} **${snack.name}**!\nUse \`/snack\` to eat it before studying.`,
        components: [],
    });
}

async function handleEatButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    
    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
    const userSnacks = inventory.filter(i => i.item_key.startsWith('snack_') && i.quantity > 0);

    if (userSnacks.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed('No Snacks', 'You don\'t have any snacks to eat. Craft some first!')],
            flags: 64,
        });
    }

    const options = userSnacks.map(snackItem => {
        const snackKey = snackItem.item_key.replace('snack_', '');
        const snack = StudySnacks[snackKey];
        return {
            label: `${snack.name} (x${snackItem.quantity})`,
            value: snackKey,
            emoji: snack.emoji,
            description: snack.description,
        };
    });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('snack_select_eat')
            .setPlaceholder('Choose a snack to eat')
            .addOptions(options)
    );

    await interaction.reply({ content: `🤤 **Choose a snack to eat:**\nEating a snack will overwrite your current active buff.`, components: [row], flags: 64 });
}

async function handleEatSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const snackKey = interaction.values[0];
    const snack = StudySnacks[snackKey];

    if (!snack) {
        return interaction.update({ content: `❌ Invalid snack.`, components: [] });
    }

    const snackItemKey = `snack_${snackKey}`;
    const snackItem = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ? AND quantity > 0').get(userId, snackItemKey);

    if (!snackItem) {
        return interaction.update({ content: `❌ You don't have this snack anymore.`, components: [] });
    }

    // Calculate expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + snack.durationMinutes * 60000);

    // Consume snack and update buff atomically
    try {
        await transactionManager.execute(async (ctx) => {
            const success = await inventoryRepository.removeItem(userId, snackItemKey, 1, ctx);
            if (!success) throw new Error('INSUFFICIENT_INVENTORY');
            
            let identityUserId = await identityRepository.lookupIdentity('discord', userId, ctx);
            if (identityUserId) await userRepository.updateUser(identityUserId, {
                active_buff_type: snack.buffType,
                active_buff_value: snack.buffValue,
                buff_expires_at: expiresAt.toISOString(),
            }, ctx);
        });
    } catch (err) {
        return interaction.update({ content: `❌ Failed to eat snack.`, components: [] });
    }

    await interaction.update({
        content: `🤤 You ate the ${snack.emoji} **${snack.name}**!\n**Active Buff:** ${snack.description}\n*(Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>)*`,
        components: [],
    });
}

module.exports.handleCraftButton = handleCraftButton;
module.exports.handleCraftSelect = handleCraftSelect;
module.exports.handleEatButton = handleEatButton;
module.exports.handleEatSelect = handleEatSelect;
