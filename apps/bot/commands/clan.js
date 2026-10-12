/**
 * /clan - Clash of Pomo Clan System
 * Create, invite, manage and view the global clan leaderboards.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Plants, TreeRequirements } = require('../utils/constants');
const {
    getOrCreateUser,
    getUserClan,
    createClan,
    joinClan,
    leaveClan,
    createClanInvite,
    getPendingClanInvite,
    acceptClanInvite,
    revokePendingClanInvitesForUser,
    transferClanOwnership,
    dissolveClan,
    getClanLeaderboardTotal,
    getClanMembers,
    getClanInventory,
    donateToClan,
    upgradeClanTree,
    db,
} = require('../utils/database');
const { formatTime, errorEmbed, successEmbed, infoEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const CLAN_CREATE_COST = 1000;
const CLAN_MIN_LEVEL = 5;
const CLAN_MEMBER_LIMIT = 50;
const CLAN_BROADCAST_COOLDOWN_MS = 24 * 60 * 60 * 1000;

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('clan')
        .setDescription('Clash of Pomo Clan System')
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Create a new clan (Cost: 1000 water, Requires: Level 5)')
            .addStringOption(opt => opt.setName('name').setDescription('Name of your clan (max 20 chars)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('invite')
            .setDescription('Invite a user to your clan')
            .addUserOption(opt => opt.setName('user').setDescription('User to invite').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('join')
            .setDescription('Join a clan you were invited to')
            .addStringOption(opt => opt.setName('name').setDescription('Name of the clan').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('leave')
            .setDescription('Leave your current clan')
        )
        .addSubcommand(sub => sub
            .setName('transfer')
            .setDescription('Transfer clan ownership to another member')
            .addUserOption(opt => opt.setName('user').setDescription('New clan owner').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('dissolve')
            .setDescription('Permanently dissolve your clan (Owner only)')
            .addStringOption(opt => opt.setName('confirm').setDescription('Type your clan name to confirm').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('info')
            .setDescription('View your current clan details')
        )
        .addSubcommand(sub => sub
            .setName('kick')
            .setDescription('Remove a member from the clan (Owner only)')
            .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('dm')
            .setDescription('Send a direct message to all clan members (Owner only)')
            .addStringOption(opt => opt.setName('message').setDescription('Message to send (max 300 chars)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('View the Global Clan Leaderboard')
        )
        .addSubcommand(sub => sub
            .setName('donate')
            .setDescription('Donate water or crops to your clan treasury')
            .addStringOption(opt => opt.setName('item').setDescription('Item to donate').setRequired(true).setAutocomplete(true))
            .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to donate (default: 1)').setRequired(false).setMinValue(1))
            .addBooleanOption(opt => opt.setName('all').setDescription('Donate all of this item').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('treasury')
            .setDescription('View the clan treasury and Clan Tree status')
        )
        .addSubcommand(sub => sub
            .setName('tree')
            .setDescription('Upgrade the Clan Tree using treasury resources (Owner/Co-owner only)')
        )
        .addSubcommand(sub => sub
            .setName('expedition')
            .setDescription('Start or view clan expeditions for massive rewards')
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const userId = interaction.user.id;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'donate') {
            const user = getOrCreateUser(userId);
            const inventory = db.prepare('SELECT item_key, quantity FROM inventory WHERE user_id = ? AND quantity > 0').all(userId);
            
            const fruitCount = inventory.filter(i => Plants[i.item_key]).length;

            const choices = [];
            if (fruitCount > 0) {
                choices.push({ name: `🍎 All Fruits / Crops (${fruitCount} types)`, value: 'all_fruits' });
            }
            if (user.water > 0 || fruitCount > 0) {
                choices.push({ name: `🎁 Everything (Water & Fruits)`, value: 'all_items' });
            }
            choices.push({ name: `💧 Water (You have: ${user.water})`, value: 'water' });

            for (const inv of inventory) {
                const plant = Plants[inv.item_key];
                if (plant) {
                    choices.push({ name: `${plant.emoji} ${plant.name} (You have: ${inv.quantity})`, value: inv.item_key });
                }
            }

            const filtered = choices.filter(c => c.name.toLowerCase().includes(focusedValue));
            await interaction.respond(filtered.slice(0, 25));
        }
    },

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const subCmd = interaction.options.getSubcommand();
        const discordId = interaction.user.id;
        const user = getOrCreateUser(discordId);
        const currentClan = getUserClan(discordId);

        if (subCmd === 'create') {
            return handleCreate(interaction, user, currentClan, language);
        }

        if (subCmd === 'invite') {
            return handleInvite(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'join') {
            return handleJoin(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'leave') {
            return handleLeave(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'transfer') {
            return handleTransfer(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'dissolve') {
            return handleDissolve(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'info') {
            return handleInfo(interaction, currentClan, language);
        }

        if (subCmd === 'kick') {
            return handleKick(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'dm') {
            return handleBroadcast(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'leaderboard') {
            return handleLeaderboard(interaction, language);
        }

        if (subCmd === 'donate') {
            return handleDonate(interaction, discordId, currentClan, language);
        }

        if (subCmd === 'treasury') {
            return handleTreasury(interaction, currentClan, language);
        }

        if (subCmd === 'tree') {
            return handleTreeUpgrade(interaction, currentClan, language);
        }

        if (subCmd === 'expedition') {
            return handleExpedition(interaction);
        }

        return interaction.reply({ content: t(language, 'unknownSubcommandBody'), flags: 64 });
    },
};

async function handleCreate(interaction, user, currentClan, language) {
    if (currentClan) {
        return interaction.reply({
            content: t(language, 'clanAlreadyInClanBody', { name: currentClan.name }),
            flags: 64,
        });
    }

    if (user.level < CLAN_MIN_LEVEL) {
        return interaction.reply({
            content: t(language, 'clanCreateLevelBody', { level: CLAN_MIN_LEVEL }),
            flags: 64,
        });
    }

    if (user.water < CLAN_CREATE_COST) {
        return interaction.reply({
            content: t(language, 'clanCreateCostBody', { cost: CLAN_CREATE_COST, water: user.water }),
            flags: 64,
        });
    }

    const name = interaction.options.getString('name').trim();
    if (name.length < 3 || name.length > 20) {
        return interaction.reply({ content: t(language, 'clanNameLengthBody'), flags: 64 });
    }

    try {
        db.prepare('UPDATE users SET water = water - ? WHERE discord_id = ?').run(CLAN_CREATE_COST, interaction.user.id);
        createClan(interaction.user.id, name);

        const embed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(t(language, 'clanCreatedTitle', { name }))
            .setDescription(t(language, 'clanCreatedBody', { name, cost: CLAN_CREATE_COST }))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        db.prepare('UPDATE users SET water = water + ? WHERE discord_id = ?').run(CLAN_CREATE_COST, interaction.user.id);

        if (err.message?.includes('UNIQUE constraint')) {
            return interaction.reply({
                content: t(language, 'clanNameTakenBody', { name }),
                flags: 64,
            });
        }

        console.error(err);
        return interaction.reply({ content: t(language, 'genericErrorBody'), flags: 64 });
    }
}

async function handleInvite(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role !== 'owner') {
        return interaction.reply({ content: t(language, 'clanInviteOwnerOnlyBody'), flags: 64 });
    }

    const targetUser = interaction.options.getUser('user');
    if (targetUser.bot) {
        return interaction.reply({ content: t(language, 'clanInviteNoBotsBody'), flags: 64 });
    }

    if (targetUser.id === discordId) {
        return interaction.reply({ content: t(language, 'clanInviteNoSelfBody'), flags: 64 });
    }

    const targetClan = getUserClan(targetUser.id);
    if (targetClan) {
        return interaction.reply({ content: t(language, 'clanInviteAlreadyMemberBody'), flags: 64 });
    }

    const inviteResult = createClanInvite(currentClan.id, discordId, targetUser.id);
    if (!inviteResult.success) {
        return interaction.reply({
            content: t(language, 'clanInvitePendingBody', { user: `<@${targetUser.id}>`, name: currentClan.name }),
            flags: 64,
        });
    }

    try {
        await targetUser.send(t(language, 'clanInviteDmBody', {
            user: interaction.user.username,
            name: currentClan.name,
        }));
        return interaction.reply({
            content: t(language, 'clanInviteSentBody', { user: `<@${targetUser.id}>` }),
            flags: 64,
        });
    } catch (_) {
        return interaction.reply({
            content: t(language, 'clanInvitePublicBody', { user: `<@${targetUser.id}>`, name: currentClan.name }),
        });
    }
}

async function handleJoin(interaction, discordId, currentClan, language) {
    if (currentClan) {
        return interaction.reply({ content: t(language, 'clanJoinAlreadyInClanBody'), flags: 64 });
    }

    const name = interaction.options.getString('name').trim();
    const clan = db.prepare('SELECT * FROM clans WHERE name COLLATE NOCASE = ?').get(name);
    if (!clan) {
        return interaction.reply({
            content: t(language, 'clanNotFoundBody', { name }),
            flags: 64,
        });
    }

    const invite = getPendingClanInvite(clan.id, discordId);
    if (!invite) {
        return interaction.reply({
            content: t(language, 'clanJoinNoInviteBody', { name: clan.name }),
            flags: 64,
        });
    }

    joinClan(clan.id, discordId);
    acceptClanInvite(invite.id);
    revokePendingClanInvitesForUser(discordId);

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'clanJoinedTitle'))
        .setDescription(t(language, 'clanJoinedBody', { name: clan.name }));

    return interaction.reply({ embeds: [embed] });
}

async function handleLeave(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role === 'owner') {
        return interaction.reply({
            content: t(language, 'clanOwnerCannotLeaveBody', { name: currentClan.name }),
            flags: 64,
        });
    }

    leaveClan(discordId);
    return interaction.reply({
        content: t(language, 'clanLeftBody', { name: currentClan.name }),
        flags: 64,
    });
}

async function handleTransfer(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role !== 'owner') {
        return interaction.reply({ content: t(language, 'clanTransferOwnerOnlyBody'), flags: 64 });
    }

    const targetUser = interaction.options.getUser('user');
    if (targetUser.bot) {
        return interaction.reply({ content: t(language, 'clanTransferNoBotsBody'), flags: 64 });
    }

    if (targetUser.id === discordId) {
        return interaction.reply({ content: t(language, 'clanTransferAlreadyOwnerBody'), flags: 64 });
    }

    const targetClan = getUserClan(targetUser.id);
    if (!targetClan || targetClan.id !== currentClan.id) {
        return interaction.reply({
            content: t(language, 'clanTransferTargetNotMemberBody', { user: `<@${targetUser.id}>`, name: currentClan.name }),
            flags: 64,
        });
    }

    const ok = transferClanOwnership(currentClan.id, discordId, targetUser.id);
    if (!ok) {
        return interaction.reply({ content: t(language, 'clanTransferFailedBody'), flags: 64 });
    }

    try {
        await targetUser.send(t(language, 'clanTransferDmBody', { name: currentClan.name }));
    } catch (_) {}

    return interaction.reply({
        content: t(language, 'clanTransferSuccessBody', { name: currentClan.name, user: `<@${targetUser.id}>` }),
    });
}

async function handleDissolve(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role !== 'owner') {
        return interaction.reply({ content: t(language, 'clanDissolveOwnerOnlyBody'), flags: 64 });
    }

    const confirm = interaction.options.getString('confirm').trim();
    if (confirm !== currentClan.name) {
        return interaction.reply({
            content: t(language, 'clanDissolveConfirmBody', { name: currentClan.name }),
            flags: 64,
        });
    }

    const members = getClanMembers(currentClan.id);
    const ok = dissolveClan(currentClan.id);
    if (!ok) {
        return interaction.reply({ content: t(language, 'clanDissolveFailedBody'), flags: 64 });
    }

    for (const member of members) {
        if (member.discord_id === discordId) continue;
        try {
            const dcUser = await interaction.client.users.fetch(member.discord_id);
            await dcUser.send(t(language, 'clanDissolvedDmBody', { name: currentClan.name }));
        } catch (_) {}
    }

    return interaction.reply({
        content: t(language, 'clanDissolvedBody', { name: currentClan.name }),
    });
}

async function handleInfo(interaction, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanInfoNoClanBody'), flags: 64 });
    }

    const members = getClanMembers(currentClan.id);
    const owner = members.find(m => m.role === 'owner');
    const today = new Date().toISOString().split('T')[0];
    const memberIds = members.map(m => m.discord_id);
    const focusMap = {};

    if (memberIds.length > 0) {
        const placeholders = memberIds.map(() => '?').join(',');
        const dailyFocus = db.prepare(`
            SELECT user_id, SUM(duration) as today_focus
            FROM study_sessions
            WHERE user_id IN (${placeholders})
              AND date(started_at) = ?
              AND completed = 1
            GROUP BY user_id
        `).all(...memberIds, today);

        for (const f of dailyFocus) {
            focusMap[f.user_id] = f.today_focus;
        }
    }

    const membersList = members
        .map(member => {
            const prefix = member.role === 'owner' ? '[Owner]' : '[Member]';
            const focusMinutes = focusMap[member.discord_id] || 0;
            const status = focusMinutes > 0
                ? t(language, 'clanTodayFocusLabel', { minutes: focusMinutes })
                : t(language, 'clanOfflineLabel');
            return `${prefix} <@${member.discord_id}> - ${status}`;
        })
        .join('\n');

    const clanDataForInfo = db.prepare('SELECT tree_level FROM clans WHERE id = ?').get(currentClan.id);
    const treeLvl = clanDataForInfo?.tree_level || 1;

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'clanInfoTitle', { name: currentClan.name }))
        .setDescription(t(language, 'clanInfoBody', {
            level: currentClan.level,
            xp: currentClan.xp,
            focus: formatTime(currentClan.total_focus_minutes),
            owner: owner ? `<@${owner.discord_id}>` : t(language, 'unknownUserLabel'),
            count: members.length,
            limit: CLAN_MEMBER_LIMIT,
            members: membersList || t(language, 'noneLabel'),
        }))
        .addFields({ name: '🌳 Clan Tree', value: `Level **${treeLvl}** — All members get **+${treeLvl}% XP & Water** on every session!`, inline: false })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleKick(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role !== 'owner') {
        return interaction.reply({ content: t(language, 'clanKickOwnerOnlyBody'), flags: 64 });
    }

    const targetUser = interaction.options.getUser('user');
    if (targetUser.id === discordId) {
        return interaction.reply({ content: t(language, 'clanKickNoSelfBody'), flags: 64 });
    }

    const targetClan = getUserClan(targetUser.id);
    if (!targetClan || targetClan.id !== currentClan.id) {
        return interaction.reply({
            content: t(language, 'clanKickTargetNotMemberBody', { user: targetUser.username }),
            flags: 64,
        });
    }

    leaveClan(targetUser.id);

    try {
        await targetUser.send(t(language, 'clanKickedDmBody', { name: currentClan.name }));
    } catch (_) {}

    return interaction.reply({
        content: t(language, 'clanKickedBody', { user: targetUser.username }),
    });
}

async function handleBroadcast(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ content: t(language, 'clanNotInClanBody'), flags: 64 });
    }

    if (currentClan.role !== 'owner') {
        return interaction.reply({ content: t(language, 'clanBroadcastOwnerOnlyBody'), flags: 64 });
    }

    const message = interaction.options.getString('message');
    if (message.length > 300) {
        return interaction.reply({ content: t(language, 'clanBroadcastTooLongBody'), flags: 64 });
    }

    const clanData = db.prepare('SELECT * FROM clans WHERE id = ?').get(currentClan.id);
    if (clanData?.last_dm_at) {
        const lastDmStr = clanData.last_dm_at.includes('T') ? clanData.last_dm_at : `${clanData.last_dm_at.replace(' ', 'T')}Z`;
        const lastDm = new Date(lastDmStr).getTime();
        const remainingMs = CLAN_BROADCAST_COOLDOWN_MS - (Date.now() - lastDm);

        if (remainingMs > 0) {
            const hoursLeft = Math.ceil(remainingMs / 3600000);
            return interaction.reply({
                content: t(language, 'clanBroadcastCooldownBody', { hours: hoursLeft }),
                flags: 64,
            });
        }
    }

    db.prepare("UPDATE clans SET last_dm_at = datetime('now') WHERE id = ?").run(currentClan.id);

    const members = getClanMembers(currentClan.id);
    let successCount = 0;
    let failCount = 0;

    await interaction.reply({ content: t(language, 'clanBroadcastStartingBody'), flags: 64 });

    for (const member of members) {
        if (member.discord_id === discordId) continue;

        try {
            const dcUser = await interaction.client.users.fetch(member.discord_id);
            await dcUser.send(t(language, 'clanBroadcastDmBody', {
                name: currentClan.name,
                sender: `<@${discordId}>`,
                message,
            }));
            successCount++;
        } catch (_) {
            failCount++;
        }
    }

    return interaction.editReply({
        content: t(language, 'clanBroadcastCompleteBody', { success: successCount, failed: failCount }),
    });
}

async function handleLeaderboard(interaction, language) {
    const topClans = getClanLeaderboardTotal(10);
    const medals = ['#1', '#2', '#3'];

    let description = t(language, 'clanLeaderboardIntroBody');
    if (topClans.length === 0) {
        description += `\n\n${t(language, 'clanLeaderboardEmptyBody')}`;
    } else {
        description += '\n\n';
        description += topClans
            .map((clan, index) => {
                const icon = medals[index] || `#${index + 1}`;
                return `${icon} **${clan.name}** (${t(language, 'levelShortLabel')} ${clan.level}) - ${clan.xp} XP`;
            })
            .join('\n');
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(t(language, 'clanLeaderboardTitle'))
        .setDescription(description)
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

// ─── Clan Treasury & Garden ────────────────────────────────────

async function handleDonate(interaction, discordId, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ embeds: [errorEmbed('Not in a Clan', 'You must be in a clan to donate.')], flags: 64 });
    }

    const itemKey = interaction.options.getString('item');
    const requestedAmount = interaction.options.getInteger('amount');
    const donateAll = interaction.options.getBoolean('all') || false;

    if (donateAll && requestedAmount !== null) {
        return interaction.reply({ embeds: [errorEmbed('Invalid Input', 'Please choose either a specific amount OR the "all" option.')], flags: 64 });
    }

    // Handle batch donations: 'all_fruits' or 'all_items'
    if (itemKey === 'all_fruits' || itemKey === 'all_items') {
        const user = getOrCreateUser(discordId);
        const inventory = db.prepare('SELECT item_key, quantity FROM inventory WHERE user_id = ? AND quantity > 0').all(discordId);
        const fruitItems = inventory.filter(i => Plants[i.item_key]);

        if (itemKey === 'all_fruits' && fruitItems.length === 0) {
            return interaction.reply({ embeds: [errorEmbed('Not Enough', 'You don\'t have any fruits or crops in your inventory to donate.')], flags: 64 });
        }

        if (itemKey === 'all_items' && user.water <= 0 && fruitItems.length === 0) {
            return interaction.reply({ embeds: [errorEmbed('Not Enough', 'You don\'t have any water or fruits to donate.')], flags: 64 });
        }

        const summary = [];

        if (itemKey === 'all_items' && user.water > 0) {
            const wAmount = user.water;
            const res = await donateToClan(discordId, currentClan.id, 'water', wAmount);
            if (res.ok) {
                summary.push(`+${wAmount} 💧 Water`);
            }
        }

        for (const item of fruitItems) {
            const plant = Plants[item.item_key];
            const res = await donateToClan(discordId, currentClan.id, item.item_key, item.quantity);
            if (res.ok) {
                summary.push(`+${item.quantity} ${plant.emoji} ${plant.name}`);
            }
        }

        const title = itemKey === 'all_fruits' ? '🍎 All Fruits Donated!' : '🎁 Full Treasury Donation!';
        return interaction.reply({
            embeds: [successEmbed(title, `You donated **${summary.length}** item types to **${currentClan.name}**!\n\n${summary.join('\n')}`)]
        });
    }

    let amountToDonate = requestedAmount || 1;
    let itemName = '';
    let itemEmoji = '';

    if (itemKey === 'water') {
        const user = getOrCreateUser(discordId);
        amountToDonate = donateAll ? user.water : amountToDonate;
        itemName = 'Water';
        itemEmoji = '💧';
    } else {
        const plant = Plants[itemKey];
        if (!plant) {
            return interaction.reply({ embeds: [errorEmbed('Invalid Item', 'That item does not exist.')], flags: 64 });
        }
        const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get(discordId, itemKey);
        amountToDonate = donateAll ? (inv?.quantity || 0) : amountToDonate;
        itemName = plant.name;
        itemEmoji = plant.emoji;
    }

    if (amountToDonate <= 0) {
        return interaction.reply({ embeds: [errorEmbed('Not Enough', `You don't have any ${itemEmoji} **${itemName}** to donate.`)], flags: 64 });
    }

    const result = await donateToClan(discordId, currentClan.id, itemKey, amountToDonate);

    if (!result.ok) {
        return interaction.reply({ embeds: [errorEmbed('Donation Failed', `You don't have enough ${itemEmoji} **${itemName}**.`)], flags: 64 });
    }

    return interaction.reply({
        embeds: [successEmbed('Clan Donation', `You donated **${amountToDonate}×** ${itemEmoji} **${itemName}** to the **${currentClan.name}** treasury!`)]
    });
}

async function handleTreasury(interaction, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ embeds: [errorEmbed('Not in a Clan', 'You must be in a clan to view the treasury.')], flags: 64 });
    }

    const clanData = db.prepare('SELECT * FROM clans WHERE id = ?').get(currentClan.id);
    const inventory = getClanInventory(currentClan.id);

    let itemsDesc = '';
    for (const inv of inventory) {
        const plant = Plants[inv.item_key];
        if (plant) itemsDesc += `${plant.emoji} ${plant.name}: **${inv.quantity}**\n`;
    }
    if (!itemsDesc) itemsDesc = '*No crops in treasury yet. Use `/clan donate`!*';

    // Next level requirements
    const currentLevel = clanData.tree_level;
    const nextReqs = TreeRequirements[currentLevel];
    let nextLevelDesc = '';
    if (nextReqs) {
        nextLevelDesc = Object.entries(nextReqs).map(([k, v]) => {
            if (k === 'water') {
                const have = clanData.water;
                const check = have >= v ? '✅' : '❌';
                return `${check} 💧 Water: **${have}/${v}**`;
            }
            const p = Plants[k];
            const inv = inventory.find(i => i.item_key === k);
            const have = inv?.quantity || 0;
            const check = have >= v ? '✅' : '❌';
            return `${check} ${p?.emoji || ''} ${p?.name || k}: **${have}/${v}**`;
        }).join('\n');
    } else {
        nextLevelDesc = '🏆 **Max Level reached!**';
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`🏦 ${currentClan.name} Treasury & Garden`)
        .addFields(
            { name: '💧 Water', value: `**${clanData.water}**`, inline: true },
            { name: '🌳 Clan Tree', value: `Level: **${clanData.tree_level}**\nBuff: **+${clanData.tree_level}% XP & Water**`, inline: true },
            { name: '🌾 Crop Storage', value: itemsDesc, inline: false },
            { name: `📋 Next Level (Lv${currentLevel + 1}) Requirements`, value: nextLevelDesc, inline: false }
        )
        .setFooter({ text: nextReqs ? 'Donate with /clan donate — Owner/Co-owner can upgrade with /clan tree' : 'Your Clan Tree is at max level!' })
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleTreeUpgrade(interaction, currentClan, language) {
    if (!currentClan) {
        return interaction.reply({ embeds: [errorEmbed('Not in a Clan', 'You must be in a clan to upgrade the tree.')], flags: 64 });
    }

    if (currentClan.role !== 'owner' && currentClan.role !== 'co_owner') {
        return interaction.reply({ embeds: [errorEmbed('Permission Denied', 'Only the clan owner or co-owners can upgrade the Clan Tree.')], flags: 64 });
    }

    const clanData = db.prepare('SELECT * FROM clans WHERE id = ?').get(currentClan.id);
    const currentLevel = clanData.tree_level;

    const requirements = TreeRequirements[currentLevel];
    if (!requirements) {
        return interaction.reply({ embeds: [errorEmbed('Max Level', 'Your Clan Tree is already at the maximum level!')], flags: 64 });
    }

    // Attempt upgrade
    const result = upgradeClanTree(currentClan.id, requirements);

    if (!result.ok) {
        if (result.reason === 'missing_ingredients') {
            const reqDesc = Object.entries(requirements).map(([k, v]) => {
                if (k === 'water') return `💧 Water: **${v}**`;
                const p = Plants[k];
                return `${p?.emoji || ''} ${p?.name || k}: **${v}**`;
            }).join('\n');

            let missingName = result.itemKey === 'water' ? 'Water' : (Plants[result.itemKey]?.name || result.itemKey);
            let missingEmoji = result.itemKey === 'water' ? '💧' : (Plants[result.itemKey]?.emoji || '');

            return interaction.reply({ 
                embeds: [errorEmbed(
                    '🔒 Not Enough Resources', 
                    `Your clan needs more **${missingEmoji} ${missingName}** to upgrade the Clan Tree.\n\n` +
                    `**Requirements for Lv${currentLevel + 1}:**\n${reqDesc}\n\n` +
                    `Ask your clan members to use \`/clan donate\`!`
                )], 
                flags: 64 
            });
        }
        return interaction.reply({ embeds: [errorEmbed('Error', 'An unknown error occurred.')], flags: 64 });
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('🌳 Clan Tree Upgraded!')
        .setDescription(`Congratulations! The **${currentClan.name}** Clan Tree has grown to **Level ${result.newLevel}**!\n\nAll members now receive a **+${result.newLevel}% XP & Water** bonus to all study sessions!`)
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    // DM all clan members about the tree level up
    const members = getClanMembers(currentClan.id);
    const dmEmbed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('🌳 Your Clan Tree Leveled Up!')
        .setDescription(`The **${currentClan.name}** Clan Tree has grown to **Level ${result.newLevel}**!\n\n✨ You now receive **+${result.newLevel}% XP & Water** on every study session!`)
        .setFooter({ text: 'Keep donating with /clan donate to grow it further!' })
        .setTimestamp();

    for (const member of members) {
        if (member.discord_id === interaction.user.id) continue; // skip the upgrader, they already see the reply
        try {
            const discordUser = await interaction.client.users.fetch(member.discord_id);
            await discordUser.send({ embeds: [dmEmbed] });
        } catch (_) { /* User has DMs closed, skip silently */ }
    }
}

// Expedition names are stored in English ("Expedition Lv. N"); translate them on display.
function expeditionDisplayName(language, name) {
    const match = /^Expedition Lv\. (\d+)$/.exec(String(name || ''));
    return match ? t(language, 'expeditionNameLevel', { level: match[1] }) : name;
}

async function handleExpedition(interaction) {
    const language = getInteractionLanguage(interaction);
    // Clan membership lives in clan_members (users has no clan_id column)
    const clan = getUserClan(interaction.user.id);
    if (!clan) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'expeditionNoClanTitle'), t(language, 'expeditionNoClanBody'))],
            flags: 64
        });
    }

    // Expired expeditions are closed here so the owner can start a new one
    const { getActiveExpedition } = require('../utils/clanExpeditions');
    const activeExpedition = getActiveExpedition(clan.id);

    if (activeExpedition) {
        // Show current expedition
        const members = db.prepare('SELECT * FROM clan_expedition_members WHERE expedition_id = ? ORDER BY contributed_minutes DESC').all(activeExpedition.id);
        const percent = Math.min(100, Math.floor((activeExpedition.current_minutes / activeExpedition.target_minutes) * 100));
        
        let desc = `**${expeditionDisplayName(language, activeExpedition.name)}**\n`;
        desc += `${t(language, 'expeditionProgressLine', {
            current: activeExpedition.current_minutes,
            target: activeExpedition.target_minutes,
            percent,
        })}\n\n**${t(language, 'expeditionTopContributors')}**\n`;
        
        if (members.length === 0) {
            desc += t(language, 'expeditionNoContributions');
        } else {
            for (let i = 0; i < Math.min(5, members.length); i++) {
                desc += `${t(language, 'expeditionContributorLine', {
                    rank: i + 1,
                    user: `<@${members[i].user_id}>`,
                    minutes: members[i].contributed_minutes,
                })}\n`;
            }
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.PRIMARY)
            .setTitle(`🗺️ ${t(language, 'expeditionTitle', { clan: clan.name })}`)
            .setDescription(desc)
            .setFooter({ text: t(language, 'expeditionEndsAt', { time: new Date(activeExpedition.ends_at).toLocaleString() }) });

        return interaction.reply({ embeds: [embed] });
    }

    // No active expedition. If owner, allow starting one.
    if (clan.owner_id !== interaction.user.id) {
        return interaction.reply({
            embeds: [infoEmbed(t(language, 'expeditionInfoTitle'), t(language, 'expeditionOwnerOnlyBody'))],
        });
    }

    // Start a new expedition (72 hours, 500 mins target for example)
    const target = 500 * clan.level; // scales with clan level
    const endsAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    
    db.prepare('INSERT INTO clan_expeditions (clan_id, name, target_minutes, ends_at) VALUES (?, ?, ?, ?)').run(
        clan.id,
        `Expedition Lv. ${clan.level}`,
        target,
        endsAt
    );

    return interaction.reply({
        embeds: [successEmbed(t(language, 'expeditionStartedTitle'), t(language, 'expeditionStartedBody', { clan: clan.name, target }))],
    });
}
