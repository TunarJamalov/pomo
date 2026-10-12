const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
    getOrCreateUser,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    getFriends,
    getPendingRequests,
} = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('friend')
        .setDescription('Manage your PomoBot friends')
        .addSubcommand(subcommand =>
            subcommand.setName('add')
                .setDescription('Send a friend request to someone')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('accept')
                .setDescription('Accept a pending friend request')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user whose request you want to accept')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('remove')
                .setDescription('Remove a friend or cancel a request')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand.setName('list')
                .setDescription('List your current friends and pending requests')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        await interaction.deferReply();
        getOrCreateUser(userId);

        if (subcommand === 'add') {
            return handleAdd(interaction, language, userId);
        }

        if (subcommand === 'accept') {
            return handleAccept(interaction, language, userId);
        }

        if (subcommand === 'remove') {
            return handleRemove(interaction, language, userId);
        }

        if (subcommand === 'list') {
            return handleList(interaction, language, userId);
        }
    },
};

async function handleAdd(interaction, language, userId) {
    const targetUser = interaction.options.getUser('user');
    const targetMention = `<@${targetUser.id}>`;

    if (targetUser.bot) {
        return interaction.editReply({ embeds: [errorEmbed(t(language, 'invalidUserTitle'), t(language, 'friendCannotAddBots'))] });
    }
    if (targetUser.id === userId) {
        return interaction.editReply({ embeds: [errorEmbed(t(language, 'invalidUserTitle'), t(language, 'friendCannotAddSelf'))] });
    }

    getOrCreateUser(targetUser.id);
    const res = sendFriendRequest(userId, targetUser.id);

    if (res.success) {
        if (res.reason === 'auto_accepted') {
            return interaction.editReply({
                embeds: [successEmbed(t(language, 'friendAddedTitle'), t(language, 'friendAutoAcceptedBody', { user: targetMention }))],
            });
        }

        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`👋 ${t(language, 'friendRequestDmTitle')}`)
                .setDescription(t(language, 'friendRequestDmBody', { username: interaction.user.username }))
                .setThumbnail(interaction.user.displayAvatarURL());

            await targetUser.send({ embeds: [dmEmbed] });
        } catch (e) {
            console.log(`[Friend] Could not DM user ${targetUser.id} - DMs probably closed.`);
        }

        return interaction.editReply({
            embeds: [successEmbed(t(language, 'friendRequestSentTitle'), t(language, 'friendRequestSentBody', { user: targetMention }))],
        });
    }

    if (res.reason === 'already_friends') {
        return interaction.editReply({
            embeds: [errorEmbed(t(language, 'friendAlreadyFriendsTitle'), t(language, 'friendAlreadyFriendsBody', { user: targetMention }))],
        });
    }
    if (res.reason === 'already_sent') {
        return interaction.editReply({
            embeds: [errorEmbed(t(language, 'friendRequestPendingTitle'), t(language, 'friendRequestPendingBody', { user: targetMention }))],
        });
    }
}

async function handleAccept(interaction, language, userId) {
    const targetUser = interaction.options.getUser('user');
    const targetMention = `<@${targetUser.id}>`;
    const success = acceptFriendRequest(targetUser.id, userId);

    if (success) {
        return interaction.editReply({
            embeds: [successEmbed(t(language, 'friendAddedTitle'), t(language, 'friendAcceptedBody', { user: targetMention }))],
        });
    }
    return interaction.editReply({
        embeds: [errorEmbed(t(language, 'notFoundTitle'), t(language, 'friendNoPendingBody', { user: targetMention }))],
    });
}

async function handleRemove(interaction, language, userId) {
    const targetUser = interaction.options.getUser('user');
    const targetMention = `<@${targetUser.id}>`;
    const success = removeFriend(userId, targetUser.id);

    if (success) {
        return interaction.editReply({
            embeds: [successEmbed(t(language, 'friendRemovedTitle'), t(language, 'friendRemovedBody', { user: targetMention }))],
        });
    }
    return interaction.editReply({
        embeds: [errorEmbed(t(language, 'notFoundTitle'), t(language, 'friendNotFriendsBody', { user: targetMention }))],
    });
}

async function handleList(interaction, language, userId) {
    const friends = getFriends(userId);
    const pending = getPendingRequests(userId);

    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(`👥 ${t(language, 'friendListTitle')}`)
        .setThumbnail(interaction.user.displayAvatarURL());

    if (friends.length === 0 && pending.length === 0) {
        embed.setDescription(t(language, 'friendEmptyBody'));
    } else {
        let desc = '';
        if (pending.length > 0) {
            desc += `**📥 ${t(language, 'friendPendingRequests')}**\n`;
            pending.forEach(p => {
                const receivedAt = Math.floor(new Date(`${p.created_at}Z`).getTime() / 1000);
                desc += `• <@${p.sender_id}> (${t(language, 'friendReceived')}: <t:${receivedAt}:R>)\n`;
            });
            desc += '\n';
        }

        desc += `**👯 ${t(language, 'friendFriends')} (${friends.length})**\n`;
        if (friends.length > 0) {
            friends.forEach(fId => {
                desc += `• <@${fId}>\n`;
            });
        } else {
            desc += `*${t(language, 'friendNoneYet')}*`;
        }
        embed.setDescription(desc);
    }

    return interaction.editReply({ embeds: [embed] });
}
