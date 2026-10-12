const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Pets, PetMultipliers, Plants, petBuffMultiplier } = require('../utils/constants');
const { getOrCreateUser, db, transactionManager, userRepository, inventoryRepository, petRepository } = require('../utils/database');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

// Legacy sqlite pet/inventory tables are keyed by Discord id, so repository
// calls take the Discord id directly (no identity lookup needed).
async function petOwnerId(discordId) {
    return discordId;
}

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('pet')
        .setDescription('Manage your Study Pets')
        .addSubcommand(sub =>
            sub.setName('inventory')
                .setDescription('View all your owned pets and their progress'))
        .addSubcommand(sub =>
            sub.setName('equip')
                .setDescription('Equip a pet to accompany you in study sessions')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Select a pet from your inventory')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(sub =>
            sub.setName('guide')
                .setDescription('View all pets, their abilities, and drop rates'))
        .addSubcommand(sub =>
            sub.setName('feed')
                .setDescription('Feed harvested plants to your active pet to give it XP')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('Select a plant from your inventory')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('How many to feed (default: 1)')
                        .setRequired(false)
                        .setMinValue(1))
                .addBooleanOption(option =>
                    option.setName('all')
                        .setDescription('Feed all of this plant from your inventory')
                        .setRequired(false)))
        .addSubcommand(sub =>
            sub.setName('evolve')
                .setDescription('Evolve your active pet once it reaches Lv10 (requires specific crops)')),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'equip') {
            const ownedPets = await petRepository.getOwnedPets(await petOwnerId(userId));
            const choices = ownedPets.filter(p => Pets[p.pet_key]).map(p => {
                const petInfo = Pets[p.pet_key];
                const activeMark = p.is_active ? ' [Active]' : '';
                return {
                    name: `${petInfo.emoji} ${petInfo.name} (Lv. ${p.level})${activeMark}`,
                    value: p.pet_key,
                };
            });
            const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue));
            await interaction.respond(filtered.slice(0, 25));
        } else if (subcommand === 'feed') {
            const inventory = db.prepare('SELECT item_key, quantity FROM inventory WHERE user_id = ? AND quantity > 0').all(userId);
            const choices = inventory
                .filter(inv => Plants[inv.item_key])
                .map(inv => {
                    const plant = Plants[inv.item_key];
                    return {
                        name: `${plant.emoji} ${plant.name} (x${inv.quantity}) - Gives ${plant.feedXP} XP`,
                        value: inv.item_key,
                    };
                });
            const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue));
            await interaction.respond(filtered.slice(0, 25));
        }
    },

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'inventory') {
            await handleInventory(interaction, userId, language);
        } else if (subcommand === 'equip') {
            await handleEquip(interaction, userId, language);
        } else if (subcommand === 'guide') {
            await handleGuide(interaction, language);
        } else if (subcommand === 'feed') {
            await handleFeed(interaction, userId, language);
        } else if (subcommand === 'evolve') {
            await handleEvolve(interaction, userId, language);
        }
    },
};

async function handleInventory(interaction, userId, language) {
    const pets = await petRepository.getOwnedPets(await petOwnerId(userId));

    if (pets.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`🐾 ${t(language, 'petInventoryTitle')}`)
                .setDescription(t(language, 'petInventoryEmpty'))
                .setTimestamp()],
        });
    }

    let description = `${t(language, 'petInventoryIntro')}\n\n`;

    for (const p of pets) {
        const info = Pets[p.pet_key];
        if (!info) continue;
        const status = p.is_active ? ` **[${t(language, 'petActiveMarker')}]**` : '';
        const xpNeeded = p.level * 50;
        const evolved = p.evolved === 1;
        const emoji = evolved ? (info.evolvedEmoji ?? info.emoji) : info.emoji;
        const buffKind = info.buffType === 'water_boost' ? '💧' : '✨';

        description += `${emoji} **${info.name}**${evolved ? ' ✨ (Evolved)' : ''} ${status}\n`;
        description += `- ${t(language, 'level')} **${p.level}** (${p.xp}/${xpNeeded} XP) | ${t(language, 'petRarity')}: *${info.rarity}*\n`;
        description += `- ${t(language, 'petBuff')}: **+${Math.round(petBuffMultiplier(p) * 100)}%** ${buffKind}\n\n`;
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`🐾 ${t(language, 'petYourPetsTitle', { owned: pets.length, total: Object.keys(Pets).length })}`)
        .setDescription(description)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: t(language, 'petInventoryFooter') })
        .setTimestamp();

    // If user has an active pet with a custom image, show it
    const activePetRow = pets.find(p => p.is_active);
    if (activePetRow && Pets[activePetRow.pet_key]?.imageUrl) {
        embed.setImage(Pets[activePetRow.pet_key].imageUrl);
    }

    await interaction.reply({ embeds: [embed] });
}

// Autocomplete sends the pet key, but users can also type a name ("owl") when
// the suggestions don't load; match those against keys and names too.
function resolvePetKey(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (Pets[raw]) return raw;
    const words = raw.replace(/\(.*?\)/g, ' ').replace(/[^a-z]+/g, ' ').trim();
    const slug = words.replace(/ /g, '_');
    if (Pets[slug]) return slug;
    const matches = Object.entries(Pets).filter(([key, p]) =>
        words && (key.split('_').includes(slug) || p.name.toLowerCase().includes(words)));
    return matches.length === 1 ? matches[0][0] : raw;
}

async function handleEquip(interaction, userId, language) {
    const petKey = resolvePetKey(interaction.options.getString('name'));
    const petInfo = Pets[petKey];

    if (!petInfo) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petInvalidTitle'), t(language, 'petInvalidBody'))],
            flags: 64,
        });
    }

    const owned = db.prepare('SELECT * FROM user_pets WHERE user_id = ? AND pet_key = ?').get(userId, petKey);
    if (!owned) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petNotOwnedTitle'), t(language, 'petNotOwnedBody', { pet: petInfo.name }))],
            flags: 64,
        });
    }

    const equipped = await petRepository.equipPet(await petOwnerId(userId), petKey);
    if (!equipped) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petNotOwnedTitle'), t(language, 'petNotOwnedBody', { pet: petInfo.name }))],
            flags: 64,
        });
    }

    await interaction.reply({
        embeds: [successEmbed(
            t(language, 'petEquippedTitle'),
            t(language, 'petEquippedBody', { pet: `${petInfo.emoji} ${petInfo.name}` })
        )],
    });
}

async function handleGuide(interaction, language) {
    const rarityOrder = ['Common', 'Rare', 'Epic', 'Legendary'];
    const rarityEmoji = { Common: '⬜', Rare: '🟦', Epic: '🟪', Legendary: '🟨' };

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`🐾 ${t(language, 'petGuideTitle')}`)
        .setDescription(t(language, 'petGuideBody'))
        .setTimestamp();

    for (const rarity of rarityOrder) {
        const petsInRarity = Object.entries(Pets).filter(([, p]) => p.rarity === rarity);
        const mult = PetMultipliers[rarity];

        let fieldValue = '';
        for (const [, p] of petsInRarity) {
            const dropPct = p.dropChance > 30
                ? t(language, 'petDropHigh')
                : p.dropChance > 10
                    ? t(language, 'petDropMedium')
                    : p.dropChance > 2
                        ? t(language, 'petDropLow')
                        : t(language, 'petDropVeryLow');
            fieldValue += `${p.emoji} **${p.name}** \`${t(language, 'petDropLabel', { value: dropPct })}\`\n`;
            fieldValue += `   - ${p.buffType === 'xp_boost' ? `✨ ${t(language, 'petXpBoost')}` : `💧 ${t(language, 'petWaterBoost')}`}: +${Math.round(mult * 100)}%/level\n`;
            if (p.special) {
                fieldValue += `   - ${p.specialDesc}\n`;
            }
            fieldValue += '\n';
        }

        embed.addFields({
            name: `${rarityEmoji[rarity]} ${rarity}`,
            value: fieldValue.trim(),
            inline: false,
        });
    }

    embed.setFooter({ text: t(language, 'petGuideFooter') });

    await interaction.reply({ embeds: [embed] });
}

async function handleFeed(interaction, userId, language) {
    const itemKey = interaction.options.getString('item');
    const requestedAmount = interaction.options.getInteger('amount');
    const feedAll = interaction.options.getBoolean('all') || false;

    if (feedAll && requestedAmount !== null) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petFeedChooseAmountOrAllTitle'), t(language, 'petFeedChooseAmountOrAllBody'))],
            flags: 64,
        });
    }

    const plant = Plants[itemKey];
    if (!plant) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petInvalidItemTitle'), t(language, 'petInvalidItemBody'))],
            flags: 64,
        });
    }

    const inventory = db.prepare('SELECT quantity, id FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
    const amount = feedAll ? inventory?.quantity || 0 : requestedAmount || 1;

    if (!inventory || inventory.quantity < amount) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petNotEnoughItemsTitle'), t(language, 'petNotEnoughItemsBody', { amount, plant: plant.name }))],
            flags: 64,
        });
    }

    const activePet = await petRepository.getActivePet(userId);
    if (!activePet) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'petNoActiveTitle'), t(language, 'petNoActiveBody'))],
            flags: 64,
        });
    }

    const petInfo = Pets[activePet.pet_key];

    // Check for preferred food bonus
    const isPreferred = petInfo.preferredFood === itemKey;
    const bonusMultiplier = isPreferred ? (1 + (petInfo.preferredFoodBonus ?? 0)) : 1;
    const baseXP = plant.feedXP * amount;
    const totalXP = Math.round(baseXP * bonusMultiplier);

    let petResult;
    try {
        await transactionManager.execute(async (ctx) => {
            const success = await inventoryRepository.removeItem(userId, itemKey, amount, ctx);
            if (!success) throw new Error('INSUFFICIENT_INVENTORY');
            
            petResult = await petRepository.awardPetXP(userId, totalXP, ctx);
            if (!petResult) throw new Error('NO_ACTIVE_PET');
        });
    } catch (err) {
        return interaction.reply({
            embeds: [errorEmbed('Feed Failed', 'Could not feed your pet (maybe you ran out of food concurrently).')],
            flags: 64,
        });
    }

    // Build description
    const preferredLine = isPreferred
        ? `\n🌟 **Favourite food!** ${petInfo.emoji} loves ${plant.emoji} ${plant.name} — **+${Math.round(petInfo.preferredFoodBonus * 100)}% bonus XP!**`
        : `\n💡 *Tip: ${petInfo.emoji} ${petInfo.name}'s favourite food is ${Plants[petInfo.preferredFood]?.emoji ?? ''} ${Plants[petInfo.preferredFood]?.name ?? petInfo.preferredFood}!*`;

    let desc = t(language, 'petFedBody', {
        amount,
        plant: plant.name,
        plantEmoji: plant.emoji,
        pet: petInfo.name,
        petEmoji: petInfo.emoji,
        xp: totalXP,
    }) + preferredLine;

    if (petResult && petResult.leveledUp) {
        desc += `\n\n🎉 **${t(language, 'petLevelUpLine', { level: petResult.pet.level })}**`;
        if (petResult.pet.level === 10 && activePet.evolved !== 1) {
            const req = petInfo.evolveRequires;
            const reqStr = Object.entries(req)
                .map(([k, v]) => `${Plants[k]?.emoji ?? ''} ${Plants[k]?.name ?? k} ×${v}`)
                .join(', ');
            desc += `\n\n✨ **MAX LEVEL REACHED!** Your ${petInfo.emoji} ${petInfo.name} can now evolve!\nUse \`/pet evolve\` with: ${reqStr}`;
        }
    }

    await interaction.reply({
        embeds: [successEmbed(t(language, 'petFedTitle'), desc)],
    });
}

async function handleEvolve(interaction, userId, language) {
    const activePet = await petRepository.getActivePet(userId);
    if (!activePet) {
        return interaction.reply({
            embeds: [errorEmbed('No Active Pet', 'You need an active pet to evolve. Use `/pet equip` first.')],
            flags: 64,
        });
    }

    if (activePet.evolved === 1) return interaction.reply({ embeds: [errorEmbed("Already Evolved", "This pet has already evolved!")], flags: 64 });
    const petInfo = Pets[activePet.pet_key];
    if (!petInfo.evolveRequires) {
        return interaction.reply({
            embeds: [errorEmbed('Cannot Evolve', `${petInfo.emoji} ${petInfo.name} cannot be evolved.`)],
            flags: 64,
        });
    }

    // Show requirements if not yet at Lv10
    if (activePet.level < 10) {
        const req = petInfo.evolveRequires;
        const reqStr = Object.entries(req)
            .map(([k, v]) => `${Plants[k]?.emoji ?? ''} **${Plants[k]?.name ?? k}** ×${v}`)
            .join('\n');
        return interaction.reply({
            embeds: [errorEmbed(
                '🔒 Not Ready Yet',
                `${petInfo.emoji} **${petInfo.name}** needs to reach **Level 10** before it can evolve.\n\n` +
                `Current level: **${activePet.level}/10**\n\n` +
                `**Evolution requirements:**\n${reqStr}`
            )],
            flags: 64,
        });
    }

    let result = { ok: true };
    try {
        await transactionManager.execute(async (ctx) => {
            // Check and consume required crops
            for (const [cropKey, reqAmount] of Object.entries(petInfo.evolveRequires)) {
                const success = await inventoryRepository.removeItem(userId, cropKey, reqAmount, ctx);
                if (!success) {
                    const have = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, cropKey)?.quantity || 0;
                    throw new Error(`MISSING_INGREDIENTS:${cropKey}:${reqAmount}:${have}`);
                }
            }
            
            const success = await petRepository.evolvePet(userId, activePet.pet_key, ctx);
            if (!success) throw new Error('ALREADY_EVOLVED');
        });
    } catch (err) {
        if (err.message.startsWith('MISSING_INGREDIENTS:')) {
            const [_, itemKey, need, have] = err.message.split(':');
            result = { ok: false, reason: 'missing_ingredients', itemKey, need: parseInt(need), have: parseInt(have) };
        } else if (err.message === 'ALREADY_EVOLVED') { result = { ok: false, reason: 'already_evolved' }; } else {
            result = { ok: false, reason: 'error' };
        }
    }

    if (!result.ok) {
        if (result.reason === 'already_evolved') {
            return interaction.reply({
                embeds: [errorEmbed('Already Evolved', `${petInfo.evolvedEmoji ?? petInfo.emoji} **${petInfo.name}** has already evolved!`)],
                flags: 64,
            });
        }
        if (result.reason === 'missing_ingredients') {
            const plant = Plants[result.itemKey];
            const req = petInfo.evolveRequires;
            const reqStr = Object.entries(req)
                .map(([k, v]) => `${Plants[k]?.emoji ?? ''} **${Plants[k]?.name ?? k}** ×${v}`)
                .join('\n');
            return interaction.reply({
                embeds: [errorEmbed(
                    '🌿 Missing Crops',
                    `You need **${result.need}×** ${plant?.emoji ?? ''} ${plant?.name ?? result.itemKey} but only have **${result.have}**.\n\n` +
                    `**Full requirements:**\n${reqStr}\n\nGrow more crops in \`/garden\`!`
                )],
                flags: 64,
            });
        }
        return interaction.reply({
            embeds: [errorEmbed('Evolution Failed', 'Something went wrong. Please try again.')],
            flags: 64,
        });
    }

    // Success!
    const newEmoji = petInfo.evolvedEmoji ?? petInfo.emoji;
    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🌟 EVOLUTION!')
        .setDescription(
            `✨ ${petInfo.emoji} **${petInfo.name}** has evolved into ${newEmoji} **${petInfo.name}** (Evolved)!\n\n` +
            `📊 **Back to Lv1**, but its buff stays at full **Lv10 strength** (+${Math.round(petBuffMultiplier({ ...activePet, level: 1, evolved: 1 }) * 100)}%).\n` +
            `💪 Evolved pets earn **×1.5 pet XP** and reach **+${Math.round(petBuffMultiplier({ ...activePet, level: 10, evolved: 1 }) * 100)}%** at Lv10.\n\n` +
            `*Keep studying and feeding it with \`/pet feed\` to grow even stronger!*`
        )
        .setTimestamp();

    if (petInfo.imageUrl) embed.setThumbnail(petInfo.imageUrl);

    await interaction.reply({ embeds: [embed] });
}
