/**
 * /garden — View and manage your garden.
 * Plant seeds, water plants, and harvest ripe crops.
 * All interactions use buttons and select menus.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ComponentType,
    AttachmentBuilder,
} = require('discord.js');
const { Colors, Plants, GrowthStages } = require('../utils/constants');
const { errorEmbed, gardenEmbed } = require('../utils/embeds');
const { getOrCreateUser, db, transactionManager, userRepository, identityRepository, gardenRepository, inventoryRepository } = require('../utils/database');
const { checkGardenAchievements } = require('../utils/achievementChecker');
const { generateGardenBuffer, generateGardenShareCard } = require('../utils/canvas');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { getMaxGardenPlots, isProActive } = require('../utils/premiumManager');

function calculateWaterToNextStage(plot, plant, availableWater) {
    if (!plot || !plant || plot.stage >= 3 || availableWater <= 0) return 0;

    const progressToNextStage = plot.water_used % plant.waterPerStage;
    const waterNeeded = plant.waterPerStage - progressToNextStage;
    return Math.min(availableWater, waterNeeded);
}

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('garden')
        .setDescription('View and manage your garden')
        .addSubcommand(sub =>
            sub.setName('view')
                .setDescription('View your garden')
        )
        .addSubcommand(sub =>
            sub.setName('share')
                .setDescription('Share a beautiful snapshot of your garden')
                .addUserOption(opt =>
                    opt.setName('user')
                        .setDescription('View and share another user\'s garden')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand(false);
        const language = getInteractionLanguage(interaction);

        if (subcommand === 'share') {
            return handleGardenShare(interaction, language);
        }

        // Default: view (also handles no subcommand for backwards compatibility)
        const userId = interaction.user.id;
        getOrCreateUser(userId);
        await sendGardenView(interaction, userId, false, language);
    },
};

/**
 * Build and send the garden view embed with action buttons.
 * @param {*} interaction
 * @param {string} userId
 * @param {boolean} isUpdate - If true, update existing message instead of replying
 */
async function sendGardenView(interaction, userId, isUpdate, language = getInteractionLanguage(interaction)) {
    const plots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? ORDER BY id').all(userId);
    const user = getOrCreateUser(userId);
    const maxPlots = getMaxGardenPlots(userId);

    // Build plot display
    let gardenDisplay = '';
    if (plots.length === 0) {
        gardenDisplay = `🏜️ *${t(language, 'gardenEmptyBody')}*`;
    } else {
        plots.forEach((plot, index) => {
            const plant = Plants[plot.plant_type];
            if (!plant) return;
            const stageEmoji = plant.stages[plot.stage] || '❓';
            const stageLabel = GrowthStages[plot.stage] || t(language, 'gardenUnknownStage');
            const waterDisplay = plot.stage >= 3
                ? `✅ ${t(language, 'gardenReadyHarvest')}`
                : `💧 ${t(language, 'gardenWaterToNext', { used: plot.water_used % plant.waterPerStage, needed: plant.waterPerStage })}`;

            gardenDisplay += `**${t(language, 'gardenPlot')} ${index + 1}:** ${stageEmoji} ${plant.name} — *${stageLabel}*\n${waterDisplay}\n\n`;
        });
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.GARDEN)
        .setTitle(`🌱 ${t(language, 'gardenTitle')}`)
        .setDescription(gardenDisplay)
        .addFields(
            { name: `💧 ${t(language, 'gardenWaterBalance')}`, value: `${user.water}`, inline: true },
            { name: `🌿 ${t(language, 'gardenPlotsUsed')}`, value: `${plots.length}/${maxPlots}`, inline: true },
        )
        .setFooter({ text: t(language, 'gardenFooter') })
        .setTimestamp();

    // Build action buttons
    const hasEmptySlot = plots.length < maxPlots;
    const hasPlantToWater = plots.some(p => p.stage < 3);
    const hasRipePlant = plots.some(p => p.stage >= 3);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('garden_plant')
            .setLabel(t(language, 'gardenPlantSeed'))
            .setStyle(ButtonStyle.Success)
            .setEmoji('🌱')
            .setDisabled(!hasEmptySlot),
        new ButtonBuilder()
            .setCustomId('garden_water')
            .setLabel(t(language, 'gardenWaterPlant'))
            .setStyle(ButtonStyle.Primary)
            .setEmoji('💧')
            .setDisabled(!hasPlantToWater || user.water <= 0),
        new ButtonBuilder()
            .setCustomId('garden_harvest')
            .setLabel(t(language, 'gardenHarvest'))
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🧺')
            .setDisabled(!hasRipePlant),
    );

    const payload = { embeds: [embed], components: [row] };

    if (plots.length > 0) {
        // Drawing the garden can outlast Discord's 3-second reply window, so acknowledge first
        if (!interaction.deferred && !interaction.replied) {
            if (isUpdate) await interaction.deferUpdate();
            else await interaction.deferReply({ flags: 64 });
        }
        try {
            const buffer = await generateGardenBuffer(plots);
            const attachment = new AttachmentBuilder(buffer, { name: 'garden.png' });
            embed.setImage('attachment://garden.png');
            payload.files = [attachment];
        } catch (err) {
            console.error('[GARDEN] Failed to generate garden image:', err);
        }
    } else {
        // Clear files array when no plots exist
        payload.files = [];
        embed.setImage(null);
    }

    if (isUpdate) payload.attachments = []; // Clear existing attachments from previous message state

    if (interaction.deferred) {
        await interaction.editReply(payload);
    } else if (isUpdate) {
        await interaction.update(payload);
    } else {
        payload.flags = 64; // Only visible to the user who ran /garden — prevents others from clicking your buttons
        await interaction.reply(payload);
    }
}

// ─── Exported handler functions for button/select interactions ─────

/**
 * Handle the "Plant Seed" button — shows a select menu to pick a plant type.
 */
async function handlePlantButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    getOrCreateUser(userId);
    const plots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ?').all(userId);

    if (plots.length >= getMaxGardenPlots(userId)) {
        if (!isProActive(userId)) {
            const { triggerUpsell } = require('../utils/upsellManager');
            const upsellFired = await triggerUpsell(interaction, 'GARDEN_FULL');
            if (upsellFired) return;
        }
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'gardenFullTitle'), 'Your garden is full! Harvest a fully grown plant to free up space.')],
            flags: 64,
        });
    }

    const options = Object.entries(Plants).map(([key, plant]) => ({
        label: plant.name,
        value: key,
        emoji: plant.emoji,
        description: t(language, 'gardenPlantDescription', { plant: plant.name.toLowerCase() }),
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('garden_select_plant')
            .setPlaceholder(t(language, 'gardenChooseSeedPlaceholder'))
            .addOptions(options)
    );

    await interaction.reply({ content: `🌱 **${t(language, 'gardenChooseSeedBody')}**`, components: [row], flags: 64 });
}

/**
 * Handle plant type selection from the select menu.
 */
async function handlePlantSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const plantType = interaction.values[0];
    const plant = Plants[plantType];

    getOrCreateUser(userId); // Fix foreign key constraint if interacting with old message

    if (!plant) {
        return interaction.update({ content: `❌ ${t(language, 'gardenInvalidPlant')}`, components: [] });
    }

    const maxPlots = getMaxGardenPlots(userId);
    try {
        await transactionManager.execute(async (ctx) => {
            const currentPlots = ctx.db.prepare('SELECT COUNT(*) as cnt FROM garden_plots WHERE user_id = ?').get(userId).cnt;
            if (currentPlots >= maxPlots) {
                throw new Error('GARDEN_FULL');
            }
            await gardenRepository.plantSeed(userId, plantType, ctx);
        });
    } catch (error) {
        if (error.message === 'GARDEN_FULL') {
            return interaction.update({ content: `❌ ${t(language, 'gardenFullShort')}`, components: [] });
        }
        throw error;
    }

    await interaction.update({
        content: `🌱 ${t(language, 'gardenPlanted', { plant: plant.name })}`,
        components: [],
    });
}

/**
 * Handle the "Water Plant" button — waters the first non-ripe plant, or shows a select if multiple.
 */
async function handleWaterButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const user = getOrCreateUser(userId);

    if (user.water <= 0) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'gardenNoWaterTitle'), t(language, 'gardenNoWaterBody'))],
            flags: 64,
        });
    }

    const plots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? AND stage < 3 ORDER BY id').all(userId);
    if (plots.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'gardenNothingWaterTitle'), t(language, 'gardenNothingWaterBody'))],
            flags: 64,
        });
    }

    if (plots.length === 1) {
        // Water the only plant directly
        await waterPlot(interaction, userId, plots[0], false, language);
    } else {
        // Show select menu for which plot to water
        const options = plots.map((plot, index) => {
            const plant = Plants[plot.plant_type];
            const allPlots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? ORDER BY id').all(userId);
            const plotIndex = allPlots.findIndex(p => p.id === plot.id);
            return {
                label: `${t(language, 'gardenPlot')} ${plotIndex + 1}: ${plant.name}`,
                value: String(plot.id),
                emoji: plant.stages[plot.stage],
                description: `${GrowthStages[plot.stage]} — ${plot.water_used % plant.waterPerStage}/${plant.waterPerStage} ${t(language, 'waterLabel')}`,
            };
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('garden_select_water')
                .setPlaceholder(t(language, 'gardenChooseWaterPlaceholder'))
                .addOptions(options)
        );

        await interaction.reply({ content: `💧 **${t(language, 'gardenChooseWaterBody')}**`, components: [row], flags: 64 });
    }
}

/**
 * Handle water plot selection.
 */
async function handleWaterSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const plotId = parseInt(interaction.values[0]);
    const plot = db.prepare('SELECT * FROM garden_plots WHERE id = ? AND user_id = ?').get(plotId, userId);

    if (!plot) {
        return interaction.update({ content: `❌ ${t(language, 'gardenPlotNotFound')}`, components: [] });
    }

    await waterPlot(interaction, userId, plot, true, language);
}

/**
 * Water a specific plot.
 */
async function waterPlot(interaction, userId, plot, isSelectUpdate = false, language = getInteractionLanguage(interaction)) {
    const user = getOrCreateUser(userId);
    const plant = Plants[plot.plant_type];

    if (user.water <= 0) {
        const msg = { content: `❌ ${t(language, 'gardenNoWaterShort')}`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    if (plot.stage >= 3) {
        const msg = { content: `❌ ${t(language, 'gardenAlreadyRipe')}`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    const waterToUse = calculateWaterToNextStage(plot, plant, user.water);
    if (waterToUse <= 0) {
        const msg = { content: `❌ ${t(language, 'gardenNotEnoughWater')}`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    const newWaterUsed = plot.water_used + waterToUse;
    let newStage = plot.stage;
    if (newWaterUsed % plant.waterPerStage === 0 && newWaterUsed > 0) {
        newStage = Math.min(plot.stage + 1, 3);
    }

    try {
        await transactionManager.execute(async (ctx) => {
            const identityUserId = await identityRepository.lookupIdentity('discord', userId, ctx);
            if (!identityUserId) throw new Error('USER_NOT_FOUND');
            const success = await userRepository.deductWaterAtomic(identityUserId, waterToUse, ctx);
            if (!success) throw new Error('INSUFFICIENT_WATER');
            await gardenRepository.updatePlot(plot.id, newWaterUsed, newStage, ctx);
        });
    } catch (err) {
        console.error(`[GARDEN] waterPlot failed for user ${userId}, plot ${plot.id}:`, err.message);
        const msg = { content: `❌ ${t(language, 'gardenNotEnoughWater')}`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    const stageEmoji = plant.stages[newStage];
    let message = `💧 ${t(language, 'gardenWatered', { plant: plant.name })} (-${waterToUse} 💧) `;

    if (newStage > plot.stage) {
        message += `\n🎉 ${t(language, 'gardenGrew', { stage: GrowthStages[newStage], emoji: stageEmoji })}`;
        if (newStage >= 3) {
            message += `\n🧺 ${t(language, 'gardenReadyHarvestLine')}`;
        }
    } else {
        const remaining = plant.waterPerStage - (newWaterUsed % plant.waterPerStage);
        message += `(${t(language, 'gardenMoreWater', { count: remaining })})`;
    }

    if (isSelectUpdate) {
        await interaction.update({ content: message, components: [] });
    } else {
        await interaction.reply({ content: message, flags: 64 });
    }
}

/**
 * Handle the "Harvest" button — harvests the first ripe plant, or shows select if multiple.
 */
async function handleHarvestButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const ripePlots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? AND stage >= 3 ORDER BY id').all(userId);

    if (ripePlots.length === 0) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'gardenNothingHarvestTitle'), t(language, 'gardenNothingHarvestBody'))],
            flags: 64,
        });
    }

    if (ripePlots.length === 1) {
        await harvestPlot(interaction, userId, ripePlots[0], false, language);
    } else {
        const allPlots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? ORDER BY id').all(userId);
        const options = ripePlots.map((plot) => {
            const plant = Plants[plot.plant_type];
            const plotIndex = allPlots.findIndex(p => p.id === plot.id);
            return {
                label: `${t(language, 'gardenPlot')} ${plotIndex + 1}: ${plant.name}`,
                value: String(plot.id),
                emoji: plant.emoji,
                description: t(language, 'gardenReadyHarvest'),
            };
        });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('garden_select_harvest')
                .setPlaceholder(t(language, 'gardenChooseHarvestPlaceholder'))
                .addOptions(options)
        );

        await interaction.reply({ content: `🧺 **${t(language, 'gardenChooseHarvestBody')}**`, components: [row], flags: 64 });
    }
}

/**
 * Handle harvest plot selection.
 */
async function handleHarvestSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const userId = interaction.user.id;
    const plotId = parseInt(interaction.values[0]);
    const plot = db.prepare('SELECT * FROM garden_plots WHERE id = ? AND user_id = ?').get(plotId, userId);

    if (!plot) {
        return interaction.update({ content: `❌ ${t(language, 'gardenPlotNotFound')}`, components: [] });
    }

    await harvestPlot(interaction, userId, plot, true, language);
}

/**
 * Harvest a specific plot.
 */
async function harvestPlot(interaction, userId, plot, isSelectUpdate = false, language = getInteractionLanguage(interaction)) {
    const plant = Plants[plot.plant_type];

    if (plot.stage < 3) {
        const msg = { content: `❌ ${t(language, 'gardenNotRipe')}`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    try {
        await transactionManager.execute(async (ctx) => {
            await gardenRepository.logHarvest(userId, plot.plant_type, ctx);
            await inventoryRepository.addItem(userId, plot.plant_type, 1, ctx);
            const success = await gardenRepository.removePlot(plot.id, ctx);
            if (!success) throw new Error('PLOT_ALREADY_HARVESTED');
        });
    } catch (err) {
        const msg = { content: `❌ Failed to harvest (maybe someone else harvested it).`, components: [] };
        return isSelectUpdate ? interaction.update(msg) : interaction.reply({ ...msg, flags: 64 });
    }

    const message_parts = [
        `🧺 ${t(language, 'gardenHarvested', { plant: plant.name, emoji: plant.emoji })}`,
        `🐾 ${t(language, 'gardenHarvestPetFoodTip', { xp: plant.feedXP })}`,
    ];

    // Check garden achievements
    const newAchievements = checkGardenAchievements(userId);
    for (const ach of newAchievements) {
        message_parts.push(`🏆 **${t(language, 'achievementUnlocked')}:** ${ach.emoji} ${ach.name}`);
    }

    const message = message_parts.join('\n');

    if (isSelectUpdate) {
        await interaction.update({ content: message, components: [] });
    } else {
        await interaction.reply({ content: message });
    }
}

/**
 * Handle /garden share — generate and post a shareable garden snapshot card.
 */
async function handleGardenShare(interaction, language) {
    await interaction.deferReply();

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;

    getOrCreateUser(userId);

    const plots = db.prepare('SELECT * FROM garden_plots WHERE user_id = ? ORDER BY id').all(userId);
    const user = db.prepare('SELECT level, total_focus_minutes, water FROM users WHERE discord_id = ?').get(userId);

    if (!user) {
        return interaction.editReply({
            embeds: [errorEmbed(t(language, 'cardShareNotFoundTitle'), t(language, 'cardShareNotFoundBody', { username: targetUser.username }))],
        });
    }

    try {
        const buffer = await generateGardenShareCard(plots, user, targetUser.displayName || targetUser.username, language);
        const attachment = new AttachmentBuilder(buffer, { name: 'garden-snapshot.png' });

        const isOwnGarden = targetUser.id === interaction.user.id;

        const gardenName = t(language, 'cardGardenTitle', { username: targetUser.displayName || targetUser.username });
        await interaction.editReply({
            content: isOwnGarden
                ? `🌿 **${gardenName}** — ${t(language, 'cardShareOwnBody')}\n> *${t(language, 'cardGardenFooter')} · pomofocus.online*`
                : `🌿 **${gardenName}**`,
            files: [attachment],
        });
    } catch (err) {
        console.error('[GARDEN SHARE] Failed to generate card:', err);
        await interaction.editReply({
            embeds: [errorEmbed(t(language, 'cardShareFailedTitle'), t(language, 'cardShareFailedBody'))],
        });
    }
}

// Export handler functions for use in interactionCreate.js
module.exports.handlePlantButton = handlePlantButton;
module.exports.handlePlantSelect = handlePlantSelect;
module.exports.handleWaterButton = handleWaterButton;
module.exports.handleWaterSelect = handleWaterSelect;
module.exports.handleHarvestButton = handleHarvestButton;
module.exports.handleHarvestSelect = handleHarvestSelect;
module.exports.handleGardenShare = handleGardenShare;
module.exports.sendGardenView = sendGardenView;
module.exports._test = {
    calculateWaterToNextStage,
};
