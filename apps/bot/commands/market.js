/**
 * /market - Browse and purchase items with water.
 * Shows purchasable items and harvested inventory.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    EmbedBuilder,
} = require('discord.js');
const {
    MarketItems, Plants, Relics, Colors, waterForMinutes, xpForMinutes, Cooldowns, Themes, Pets
} = require('../utils/constants');
const { getMaxGardenPlots } = require('../utils/premiumManager');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getOrCreateUser, db, incrementUser, addPet, deductWaterAtomic, getMarketPrices, sellCrops } = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('market')
        .setDescription('Browse, buy, and sell items')
        .addSubcommand(sub =>
            sub.setName('shop')
                .setDescription('Browse and buy items from the shop')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Item to buy directly (optional)')
                        .setRequired(false)
                        .setAutocomplete(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Quantity to purchase (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(100)))
        .addSubcommand(sub =>
            sub.setName('sell')
                .setDescription('Sell your harvested crops for 💧 water')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const user = getOrCreateUser(userId);
        const sub = interaction.options.getSubcommand(false);

        // Support legacy usage (no subcommand) or /market shop
        if (!sub || sub === 'shop') {
            const itemInput = interaction.options.getString('item');
            const amount = interaction.options.getInteger('amount') || 1;
            if (itemInput) {
                return handleDirectPurchase(interaction, userId, user, itemInput, amount, language);
            }
            return sendMarketView(interaction, userId, user, language);
        }

        if (sub === 'sell') {
            return sendSellView(interaction, userId, user, language);
        }
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const choices = Object.entries(MarketItems).map(([key, item]) => ({
            name: `${item.emoji} ${item.name} - ${item.cost} 💧`,
            value: key,
        }));

        const filtered = choices
            .filter(c => c.name.toLowerCase().includes(focusedValue))
            .slice(0, 25);

        await interaction.respond(filtered);
    },
};

async function sendMarketView(interaction, userId, user, language = getInteractionLanguage(interaction)) {
    let shopDisplay = '';
    const selectOptions = [];

    for (const [key, item] of Object.entries(MarketItems)) {
        shopDisplay += `${item.emoji} **${item.name}** - 💧 ${item.cost} ${t(language, 'waterLabel')}\n*${item.description}*\n\n`;
        selectOptions.push({
            label: `${item.name} (${item.cost} 💧)`,
            value: key,
            emoji: item.emoji,
            description: item.description,
        });
    }

    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ? ORDER BY item_key').all(userId);
    let inventoryDisplay = '';
    if (inventory.length === 0) {
        inventoryDisplay = `*${t(language, 'marketEmptyInventory')}*`;
    } else {
        for (const inv of inventory) {
            const plant = Plants[inv.item_key];
            const marketItem = MarketItems[inv.item_key];
            const relic = Relics && Relics[inv.item_key];
            if (plant) {
                inventoryDisplay += `${plant.emoji} **${plant.name}** x ${inv.quantity} - ${t(language, 'marketPlantFoodLine', { xp: plant.feedXP })}\n`;
            } else if (marketItem) {
                inventoryDisplay += `${marketItem.emoji} **${marketItem.name}** x ${inv.quantity}\n`;
            } else if (relic) {
                inventoryDisplay += `${relic.emoji} **${relic.name}** x ${inv.quantity} - *Relic*\n`;
            } else {
                inventoryDisplay += `📦 **${inv.item_key}** x ${inv.quantity}\n`;
            }
        }
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.MARKET)
        .setTitle(`🏪 ${t(language, 'marketTitle')}`)
        .setDescription(t(language, 'marketBody'))
        .addFields(
            { name: `🛒 ${t(language, 'marketShop')}`, value: shopDisplay || t(language, 'marketNoItems') },
            { name: `🎒 ${t(language, 'marketInventory')}`, value: inventoryDisplay },
            { name: `💧 ${t(language, 'marketYourWater')}`, value: `${user.water}`, inline: true },
        )
        .setFooter({ text: t(language, 'marketFooter') })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_buy')
            .setPlaceholder(t(language, 'marketChooseItem'))
            .addOptions(selectOptions)
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleMarketBuy(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const itemKey = interaction.values[0];
    const item = MarketItems[itemKey];

    if (!item) {
        return interaction.update({ content: `❌ ${t(language, 'marketInvalidItemShort')}`, components: [] });
    }

    const user = getOrCreateUser(userId);

    if (user.water < item.cost) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketNotEnoughWaterTitle'), t(language, 'marketNotEnoughWaterBody', {
                cost: item.cost,
                water: user.water,
            }))],
            flags: 64,
        });
    }

    if (itemKey === 'seed_pack') {
        const plotCount = db.prepare('SELECT COUNT(*) as cnt FROM garden_plots WHERE user_id = ?').get(userId).cnt;
        if (plotCount >= getMaxGardenPlots(userId)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'gardenFullTitle'), t(language, 'marketGardenFullBody'))],
                flags: 64,
            });
        }
    }

    if (item.themeKey) {
        const alreadyOwned = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (alreadyOwned) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'marketAlreadyOwnedTitle'), t(language, 'marketAlreadyOwnedBody', {
                    item: item.name,
                }))],
                flags: 64,
            });
        }
    }

    if (!deductWaterAtomic(userId, item.cost)) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketTransactionFailedTitle'), t(language, 'marketTransactionFailedBody'))],
            flags: 64,
        });
    }

    if (itemKey === 'seed_pack') {
        const plantTypes = Object.keys(Plants);
        const randomPlant = plantTypes[Math.floor(Math.random() * plantTypes.length)];
        const plant = Plants[randomPlant];

        db.prepare(
            'INSERT INTO garden_plots (user_id, plant_type, stage, water_used, planted_at) VALUES (?, ?, 0, 0, datetime(\'now\'))'
        ).run(userId, randomPlant);

        await interaction.reply({
            embeds: [successEmbed(t(language, 'marketSeedPackOpenedTitle'), t(language, 'marketSeedPackOpenedBody', {
                plant: plant.name,
                emoji: plant.emoji,
            }))],
        });
        return;
    }

    if (itemKey === 'pet_box') {
        const result = await unboxPet(userId);
        const pet = result.pet;

        const statusText = result.isNew
            ? t(language, 'marketNewPetStatus')
            : t(language, 'marketDuplicatePetStatus', { amount: result.refundAmount });

        const embed = new EmbedBuilder()
            .setColor(result.isNew ? Colors.SUCCESS : Colors.WARNING)
            .setTitle(`📦 ${t(language, 'marketPetBoxOpenedTitle')}`)
            .setDescription(t(language, 'marketPetBoxOpenedBody', {
                pet: `${pet.emoji} ${pet.name}`,
                rarity: pet.rarity,
                buff: pet.buffDesc,
                status: statusText,
            }))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
    }

    if (item.themeKey) {
        db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1)').run(userId, itemKey);
        db.prepare('UPDATE users SET theme = ? WHERE discord_id = ?').run(item.themeKey, userId);

        await interaction.reply({
            embeds: [successEmbed(t(language, 'marketThemePurchasedTitle'), t(language, 'marketThemePurchasedBody', {
                item: item.name,
                emoji: item.emoji,
            }))],
        });
        return;
    }

    const existing = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
    if (existing) {
        db.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE id = ?').run(existing.id);
    } else {
        db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1)').run(userId, itemKey);
    }

    await interaction.reply({
        embeds: [successEmbed(t(language, 'marketPurchaseCompleteTitle'), t(language, 'marketPurchaseCompleteBody', {
            amount: 1,
            item: item.name,
            emoji: item.emoji,
            cost: item.cost,
        }))],
    });
}

module.exports.handleMarketBuy = handleMarketBuy;

// ─── Sell View ─────────────────────────────────────────────

async function sendSellView(interaction, userId, user, language = getInteractionLanguage(interaction)) {
    const prices = getMarketPrices();
    const inventory = db.prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);

    // Filter to only sellable crop items that the user actually has
    const sellableItems = inventory.filter(inv => Plants[inv.item_key] && inv.quantity > 0);

    if (sellableItems.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed('🌱 No Crops to Sell', "You don't have any harvested crops to sell. Use `/garden` to grow and harvest some first!")],
            flags: 64,
        });
    }

    // Build price display
    let priceDisplay = '';
    const selectOptions = [];

    for (const inv of sellableItems) {
        const plant = Plants[inv.item_key];
        const todayPrice = prices[inv.item_key] ?? plant.baseSellPrice;
        const totalValue = todayPrice * inv.quantity;
        const base = plant.baseSellPrice;
        const trend = todayPrice > base ? '📈' : todayPrice < base ? '📉' : '—';

        priceDisplay += `${plant.emoji} **${plant.name}** ×${inv.quantity} — ${trend} **${todayPrice}💧 each** = **${totalValue}💧**\n`;

        selectOptions.push({
            label: `Sell all ${plant.name} ×${inv.quantity} = ${totalValue}💧`,
            value: `${inv.item_key}:${inv.quantity}`,
            emoji: plant.emoji,
            description: `Today's price: ${todayPrice}💧 each`,
        });
    }

    // Also add sell-1 options
    for (const inv of sellableItems) {
        if (inv.quantity > 1) {
            const plant = Plants[inv.item_key];
            const todayPrice = prices[inv.item_key] ?? plant.baseSellPrice;
            selectOptions.push({
                label: `Sell 1 ${plant.name} = ${todayPrice}💧`,
                value: `${inv.item_key}:1`,
                emoji: plant.emoji,
                description: `You have ×${inv.quantity} total`,
            });
        }
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.MARKET)
        .setTitle('📈 Today\'s Crop Market')
        .setDescription('Prices change every day at midnight UTC. Sell now or wait for a better price!')
        .addFields(
            { name: '🌾 Your Crops', value: priceDisplay },
            { name: '💧 Your Water', value: `${user.water}`, inline: true },
        )
        .setFooter({ text: 'Use the menu below to sell | Prices reset daily at 00:00 UTC' })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('market_sell')
            .setPlaceholder('Choose what to sell...')
            .addOptions(selectOptions.slice(0, 25))
    );

    await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleMarketSell(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const [itemKey, qtyStr] = interaction.values[0].split(':');
    const quantity = parseInt(qtyStr, 10);
    const plant = Plants[itemKey];

    if (!plant) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Item', 'That crop type is not recognized.')],
            flags: 64,
        });
    }

    const result = sellCrops(userId, itemKey, quantity);

    if (!result.ok) {
        const msg = result.reason === 'not_enough'
            ? `You don't have ${quantity}× ${plant.name} to sell.`
            : 'Could not complete the sale. Please try again.';
        return interaction.reply({
            embeds: [errorEmbed('Sale Failed', msg)],
            flags: 64,
        });
    }

    const embed = successEmbed(
        '💰 Crops Sold!',
        `You sold **${quantity}× ${plant.emoji} ${plant.name}** at **${result.price}💧 each**\n\n` +
        `💵 **Earned:** +${result.waterGained}💧\n` +
        `💧 **Total Water:** ${(getOrCreateUser(userId)).water}`,
    );

    // Update the original message
    await interaction.update({ embeds: [embed], components: [] });
}

module.exports.handleMarketSell = handleMarketSell;

async function handleDirectPurchase(interaction, userId, user, itemKey, amount = 1, language = getInteractionLanguage(interaction)) {
    const item = MarketItems[itemKey];

    if (!item) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketInvalidItemTitle'), t(language, 'marketInvalidItemBody'))],
            flags: 64,
        });
    }

    if (amount > 1 && item.themeKey) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketBulkPurchaseTitle'), t(language, 'marketBulkPurchaseBody', {
                item: item.name,
            }))],
            flags: 64,
        });
    }

    const totalCost = item.cost * amount;

    if (user.water < totalCost) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketNotEnoughWaterTitle'), t(language, 'marketNotEnoughWaterBody', {
                cost: totalCost,
                water: user.water,
            }))],
            flags: 64,
        });
    }

    if (itemKey === 'seed_pack') {
        const plotCount = db.prepare('SELECT COUNT(*) as cnt FROM garden_plots WHERE user_id = ?').get(userId).cnt;
        const availablePlots = getMaxGardenPlots(userId) - plotCount;
        if (availablePlots <= 0) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'gardenFullTitle'), t(language, 'marketGardenFullBody'))],
                flags: 64,
            });
        }
        if (amount > availablePlots) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'marketNotEnoughSpaceTitle'), t(language, 'marketNotEnoughSpaceBody', {
                    available: availablePlots,
                    amount,
                }))],
                flags: 64,
            });
        }
    }

    if (item.themeKey) {
        const alreadyOwned = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (alreadyOwned) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'marketAlreadyOwnedTitle'), t(language, 'marketAlreadyOwnedBody', {
                    item: item.name,
                }))],
                flags: 64,
            });
        }
    }

    if (!deductWaterAtomic(userId, totalCost)) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'marketTransactionFailedTitle'), t(language, 'marketTransactionFailedBody'))],
            flags: 64,
        });
    }

    if (itemKey === 'seed_pack') {
        const plantTypes = Object.keys(Plants);
        const plantedNames = [];

        for (let i = 0; i < amount; i++) {
            const randomPlant = plantTypes[Math.floor(Math.random() * plantTypes.length)];
            const plant = Plants[randomPlant];
            plantedNames.push(`${plant.emoji} **${plant.name}**`);
            db.prepare(
                'INSERT INTO garden_plots (user_id, plant_type, stage, water_used, planted_at) VALUES (?, ?, 0, 0, datetime(\'now\'))'
            ).run(userId, randomPlant);
        }

        return interaction.reply({
            embeds: [successEmbed(t(language, 'marketSeedPacksOpenedTitle'), t(language, 'marketSeedPacksOpenedBody', {
                amount,
                plants: plantedNames.join(', '),
            }))],
        });
    }

    if (itemKey === 'pet_box') {
        let newPetsCount = 0;
        let totalRefund = 0;
        const pulledPets = [];

        for (let i = 0; i < amount; i++) {
            const result = await unboxPet(userId);
            const pet = result.pet;
            pulledPets.push(`${pet.emoji} **${pet.name}** (${pet.rarity})`);

            if (result.isNew) {
                newPetsCount++;
            } else {
                totalRefund += result.refundAmount;
            }
        }

        let desc = t(language, 'marketPetBoxesOpenedBody', {
            amount,
            pets: pulledPets.join('\n'),
        });
        if (newPetsCount > 0) {
            desc += `*${t(language, 'marketNewPetsStatus', { count: newPetsCount })}*\n`;
        }
        if (totalRefund > 0) {
            // unboxPet() already credited each duplicate's refund
            desc += `*${t(language, 'marketDuplicatePetsStatus', { amount: totalRefund })}*`;
        }

        const embed = new EmbedBuilder()
            .setColor(newPetsCount > 0 ? Colors.SUCCESS : Colors.WARNING)
            .setTitle(`📦 ${t(language, 'marketPetBoxesOpenedTitle')}`)
            .setDescription(desc)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    if (item.themeKey) {
        db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, 1)').run(userId, itemKey);
        db.prepare('UPDATE users SET theme = ? WHERE discord_id = ?').run(item.themeKey, userId);

        return interaction.reply({
            embeds: [successEmbed(t(language, 'marketThemePurchasedTitle'), t(language, 'marketThemePurchasedBody', {
                item: item.name,
                emoji: item.emoji,
            }))],
        });
    }

    const existing = db.prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
    if (existing) {
        db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(amount, existing.id);
    } else {
        db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, ?)').run(userId, itemKey, amount);
    }

    await interaction.reply({
        embeds: [successEmbed(t(language, 'marketPurchaseCompleteTitle'), t(language, 'marketPurchaseCompleteBody', {
            amount,
            item: item.name,
            emoji: item.emoji,
            cost: totalCost,
        }))],
    });
}

const PET_BOX_DUPLICATE_REFUND = 150;

async function unboxPet(userId) {
    const totalChance = Object.values(Pets).reduce((acc, p) => acc + p.dropChance, 0);
    let rand = Math.random() * totalChance;
    let selectedKey = Object.keys(Pets)[0];

    for (const [key, p] of Object.entries(Pets)) {
        if (rand < p.dropChance) {
            selectedKey = key;
            break;
        }
        rand -= p.dropChance;
    }

    const isNew = await addPet(userId, selectedKey);

    if (!isNew) {
        incrementUser(userId, 'water', PET_BOX_DUPLICATE_REFUND);
    }

    return { key: selectedKey, pet: Pets[selectedKey], isNew, refundAmount: isNew ? 0 : PET_BOX_DUPLICATE_REFUND };
}
