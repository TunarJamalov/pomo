const { grantProAccess, revokeProAccess } = require('../utils/premiumManager');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const {
    getOrCreateUser,
    listActivePremiumEntitlements,
    getPremiumEntitlement,
} = require('../utils/database');
const {
    syncPremiumRole,
    hasMembershipRole,
    getPremiumRoleSource,
} = require('../utils/premiumCheck');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    ownerOnly: true,
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('premiumadmin')
        .setDescription('Manage Pomo Pro Beta access (Owner only)')
        .addSubcommand(option =>
            option.setName('grant')
                .setDescription('Grant or extend Pro Beta access')
                .addUserOption(input =>
                    input.setName('user')
                        .setDescription('User receiving Pro Beta')
                        .setRequired(true))
                .addIntegerOption(input =>
                    input.setName('days')
                        .setDescription('Days to add to the current expiry')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(3650))
                .addStringOption(input =>
                    input.setName('note')
                        .setDescription('Private reason or tester note')
                        .setMaxLength(200)))
        .addSubcommand(option =>
            option.setName('revoke')
                .setDescription('Revoke Pro Beta access immediately')
                .addUserOption(input =>
                    input.setName('user')
                        .setDescription('User losing Pro Beta')
                        .setRequired(true))
                .addStringOption(input =>
                    input.setName('reason')
                        .setDescription('Private revoke reason')
                        .setMaxLength(200)))
        .addSubcommand(option =>
            option.setName('list')
                .setDescription('List active managed Pro Beta users')
                .addIntegerOption(input =>
                    input.setName('limit')
                        .setDescription('Number of users to show')
                        .setMinValue(1)
                        .setMaxValue(50)))
        .addSubcommand(option =>
            option.setName('inspect')
                .setDescription('Inspect every premium access source for a user')
                .addUserOption(input =>
                    input.setName('user')
                        .setDescription('User to inspect')
                        .setRequired(true))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'unauthorizedTitle'), t(language, 'ownerOnlyCommandBody'))],
                flags: 64,
            });
        }

        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'grant') return handleGrant(interaction);
        if (subcommand === 'revoke') return handleRevoke(interaction);
        if (subcommand === 'inspect') return handleInspect(interaction);
        return handleList(interaction);
    },
};

async function handleGrant(interaction) {
    const target = interaction.options.getUser('user');
    const days = interaction.options.getInteger('days');
    const note = interaction.options.getString('note');
    if (target.bot) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid User', 'Premium access cannot be granted to a bot.')],
            flags: 64,
        });
    }

    const entitlement = grantProAccess(target.id, days, interaction.user.id, { note, source: 'manual_beta' });
    const roleSync = await syncPremiumRole(interaction.client, target.id, true);

    await interaction.reply({
        embeds: [successEmbed(
            'Pomo Pro Beta Granted',
            `${target} received **${days} day${days === 1 ? '' : 's'}** of Pro Beta.\n\n` +
            `Expires: ${formatTimestamp(entitlement.expires_at)}\n` +
            `Supporter role: **${formatRoleSync(roleSync)}**`
        )],
        flags: 64,
    });

    await target.send({
        embeds: [new EmbedBuilder()
            .setColor(Colors.MARKET)
            .setTitle('You received Pomo Pro Beta')
            .setDescription(
                `Your Pro Beta access is active until ${formatTimestamp(entitlement.expires_at)}.\n\n` +
                'Use `/premium perks` to see the current benefits and `/premium status` at any time.'
            )
            .setTimestamp()],
    }).catch(() => {});
}

async function handleRevoke(interaction) {
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const previous = getPremiumEntitlement(target.id);
    const revoked = revokeProAccess(target.id, interaction.user.id, reason);
    const roleSync = await syncPremiumRole(interaction.client, target.id, false);

    return interaction.reply({
        embeds: [successEmbed(
            revoked ? 'Pomo Pro Beta Revoked' : 'Premium Override Cleared',
            `${target}'s managed access is now inactive.\n\n` +
            `Previous status: **${previous?.status || 'legacy/role only'}**\n` +
            `Supporter role: **${formatRoleSync(roleSync)}**`
        )],
        flags: 64,
    });
}

async function handleList(interaction) {
    const limit = interaction.options.getInteger('limit') || 25;
    const rows = listActivePremiumEntitlements(limit);
    const description = rows.length
        ? rows.map((row, index) =>
            `${index + 1}. <@${row.user_id}> - ${formatTimestamp(row.expires_at)}`
        ).join('\n')
        : 'No managed Pro Beta access is currently active.';

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.MARKET)
            .setTitle(`Active Pro Beta Users (${rows.length})`)
            .setDescription(description)
            .setFooter({ text: 'Legacy overrides and role-only supporters are not included.' })
            .setTimestamp()],
        flags: 64,
    });
}

async function handleInspect(interaction) {
    const target = interaction.options.getUser('user');
    const user = getOrCreateUser(target.id);
    const entitlement = getPremiumEntitlement(target.id);
    const membershipRole = await hasMembershipRole(interaction.client, target.id);
    const roleSource = await getPremiumRoleSource(interaction.client, target.id);
    const activeManaged = entitlement?.status === 'active';
    const active = activeManaged || user.premium === 1 || Boolean(roleSource);

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(active ? Colors.SUCCESS : Colors.INFO)
            .setTitle(`Premium Inspection: ${target.username}`)
            .addFields(
                { name: 'Effective Access', value: active ? 'Active' : 'Inactive', inline: true },
                { name: 'Managed DB', value: entitlement ? `${entitlement.status} (${entitlement.plan_key})` : 'None', inline: true },
                { name: 'Legacy Override', value: user.premium === 1 ? 'Active' : 'Inactive', inline: true },
                { name: 'Premium Role', value: roleSource === 'discord_role' ? 'Present' : 'Absent', inline: true },
                { name: 'Membership Role', value: membershipRole ? 'Present' : 'Absent', inline: true },
                { name: 'Detected Source', value: activeManaged ? entitlement.source : roleSource || (user.premium === 1 ? 'legacy_override' : 'None'), inline: true },
            )
            .setTimestamp()],
        flags: 64,
    });
}

function formatTimestamp(value) {
    if (!value) return 'No expiration';
    const timestamp = Math.floor(new Date(`${value.replace(' ', 'T')}Z`).getTime() / 1000);
    return `<t:${timestamp}:F> (<t:${timestamp}:R>)`;
}

function formatRoleSync(result) {
    const labels = {
        synced: 'Synced',
        not_configured: 'Not configured',
        guild_unavailable: 'Support server unavailable',
        not_in_support_server: 'User is not in support server',
        failed: 'Sync failed',
    };
    return labels[result] || result;
}

module.exports.formatTimestamp = formatTimestamp;
