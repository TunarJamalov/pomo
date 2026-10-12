const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');

const REQUIRED_BOT_PERMISSIONS = new PermissionsBitField([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.UseExternalEmojis,
]);

function getBotInviteUrl(clientId = process.env.CLIENT_ID) {
    if (!clientId) return 'https://discord.com/developers/applications';

    const params = new URLSearchParams({
        client_id: clientId,
        permissions: REQUIRED_BOT_PERMISSIONS.bitfield.toString(),
        integration_type: '0',
        scope: 'bot applications.commands',
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

// Adds Pomo to the user's own account (no server or admin rights needed).
function getUserInstallUrl(clientId = process.env.CLIENT_ID) {
    if (!clientId) return 'https://discord.com/developers/applications';

    const params = new URLSearchParams({
        client_id: clientId,
        integration_type: '1',
        scope: 'applications.commands',
    });

    return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

module.exports = {
    REQUIRED_BOT_PERMISSIONS,
    getBotInviteUrl,
    getUserInstallUrl,
};
