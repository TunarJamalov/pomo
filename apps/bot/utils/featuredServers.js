/**
 * Study server directory. Server admins opt in with /server feature; the bot
 * owner approves; approved servers are posted in FEATURED_SERVERS_CHANNEL_ID.
 *   /server feature  --modal-->  review message (Approve / Reject, owner only)
 *   Approve          -->         listing in the featured channel + DM to the requester
 *   /server unfeature            removes the listing at any time
 * Invites are only created after an admin asks for it.
 */
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder,
    PermissionFlagsBits, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { db } = require('./database');
const { Colors } = require('./constants');
const { t, getInteractionLanguage, getUserLanguage } = require('./i18n');

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 300;
const INVITE_PATTERN = /^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/;

function getFeatured(guildId) {
    return db.prepare('SELECT * FROM featured_servers WHERE guild_id = ?').get(guildId) || null;
}

function isOwner(interaction) {
    return Boolean(process.env.OWNER_ID) && interaction.user.id === process.env.OWNER_ID;
}

function canManage(interaction) {
    return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild));
}

function getReviewChannelId() {
    return process.env.FEATURE_REVIEW_CHANNEL_ID
        || process.env.OWNER_LOG_CHANNEL_ID
        || process.env.FEEDBACK_CHANNEL_ID
        || null;
}

async function fetchTextChannel(client, channelId) {
    if (!channelId) return null;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased?.() ? channel : null;
}

// ── /server feature ───────────────────────────────────────────

async function handleFeatureCommand(interaction) {
    const language = getInteractionLanguage(interaction);
    if (!canManage(interaction)) {
        return interaction.reply({ content: `❌ ${t(language, 'featureNeedManageServer')}`, flags: 64 });
    }

    const existing = getFeatured(interaction.guildId);
    if (existing?.status === 'approved') {
        return interaction.reply({ content: `✅ ${t(language, 'featureAlreadyListed')}`, flags: 64 });
    }
    if (existing?.status === 'pending') {
        return interaction.reply({ content: `⏳ ${t(language, 'featurePending')}`, flags: 64 });
    }

    const modal = new ModalBuilder()
        .setCustomId('feature_modal')
        .setTitle(t(language, 'featureModalTitle').slice(0, 45))
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('description')
                    .setLabel(t(language, 'featureModalDescription').slice(0, 45))
                    .setStyle(TextInputStyle.Paragraph)
                    .setMinLength(DESCRIPTION_MIN)
                    .setMaxLength(DESCRIPTION_MAX)
                    .setRequired(true),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('invite')
                    .setLabel(t(language, 'featureModalInvite').slice(0, 45))
                    .setPlaceholder('https://discord.gg/...')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(false),
            ),
        );
    return interaction.showModal(modal);
}

/** Uses the admin's own invite if given, otherwise creates a permanent one. */
async function resolveInvite(interaction, pasted) {
    if (pasted) {
        const match = pasted.trim().match(INVITE_PATTERN);
        if (!match) return { error: 'featureInviteInvalid' };
        const invite = await interaction.client.fetchInvite(match[1]).catch(() => null);
        if (!invite || invite.guild?.id !== interaction.guildId) return { error: 'featureInviteInvalid' };
        if (invite.expiresTimestamp) return { error: 'featureInviteTemporary' };
        return { url: `https://discord.gg/${invite.code}` };
    }

    const guild = interaction.guild;
    const me = guild.members.me;
    const candidates = [interaction.channel, guild.rulesChannel, guild.systemChannel].filter(Boolean);
    for (const channel of candidates) {
        if (!channel.createInvite || !channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite)) continue;
        const invite = await channel.createInvite({
            maxAge: 0,
            maxUses: 0,
            unique: false,
            reason: `Pomo study server listing, requested by ${interaction.user.tag || interaction.user.id}`,
        }).catch(() => null);
        if (invite) return { url: `https://discord.gg/${invite.code}` };
    }
    return { error: 'featureInviteNoPermission' };
}

function buildReviewMessage(row) {
    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('🏫 Study server listing request')
        .setDescription(row.description)
        .addFields(
            { name: 'Server', value: `${row.guild_name} (\`${row.guild_id}\`)`, inline: false },
            { name: 'Members', value: String(row.member_count), inline: true },
            { name: 'Requested by', value: `<@${row.requested_by}>`, inline: true },
            { name: 'Invite', value: row.invite_url, inline: false },
        )
        .setTimestamp();
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`feature_approve_${row.guild_id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`feature_reject_${row.guild_id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setLabel('Open invite').setStyle(ButtonStyle.Link).setURL(row.invite_url),
    );
    return { embeds: [embed], components: [buttons], allowedMentions: { parse: [] } };
}

async function handleFeatureModal(interaction) {
    const language = getInteractionLanguage(interaction);
    if (!canManage(interaction)) {
        return interaction.reply({ content: `❌ ${t(language, 'featureNeedManageServer')}`, flags: 64 });
    }
    await interaction.deferReply({ flags: 64 });

    const description = interaction.fields.getTextInputValue('description').trim().slice(0, DESCRIPTION_MAX);
    const pasted = interaction.fields.getTextInputValue('invite')?.trim() || '';
    const invite = await resolveInvite(interaction, pasted);
    if (invite.error) return interaction.editReply(`❌ ${t(language, invite.error)}`);

    const reviewChannel = await fetchTextChannel(interaction.client, getReviewChannelId());
    if (!reviewChannel) return interaction.editReply(`❌ ${t(language, 'featureUnavailable')}`);

    const guild = interaction.guild;
    // Only a new request or a previously rejected/removed one becomes pending
    const saved = db.prepare(`
        INSERT INTO featured_servers (guild_id, guild_name, requested_by, description, invite_url, member_count, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
        ON CONFLICT(guild_id) DO UPDATE SET
            guild_name = excluded.guild_name,
            requested_by = excluded.requested_by,
            description = excluded.description,
            invite_url = excluded.invite_url,
            member_count = excluded.member_count,
            status = 'pending',
            listing_channel_id = NULL,
            listing_message_id = NULL,
            created_at = excluded.created_at,
            reviewed_at = NULL
        WHERE featured_servers.status IN ('rejected', 'removed')
    `).run(guild.id, guild.name, interaction.user.id, description, invite.url, guild.memberCount || 0);
    if (saved.changes === 0) return interaction.editReply(`⏳ ${t(language, 'featurePending')}`);

    await reviewChannel.send(buildReviewMessage(getFeatured(guild.id)));
    return interaction.editReply(`✅ ${t(language, 'featureSubmitted')}`);
}

// ── Owner review ──────────────────────────────────────────────

function buildListingMessage(row) {
    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`📚 ${row.guild_name}`)
        .setDescription(row.description)
        .addFields({ name: 'Members', value: `${row.member_count}+`, inline: true })
        .setFooter({ text: 'Uses Pomo for focus sessions' });
    const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Join server').setStyle(ButtonStyle.Link).setURL(row.invite_url),
    );
    return { embeds: [embed], components: [button] };
}

async function notifyRequester(client, row, key) {
    const user = await client.users.fetch(row.requested_by).catch(() => null);
    if (!user) return;
    await user.send(t(getUserLanguage(row.requested_by), key, { server: row.guild_name })).catch(() => {});
}

async function handleReviewButton(interaction) {
    if (!isOwner(interaction)) {
        return interaction.reply({ content: 'Only the bot owner can review listings.', flags: 64 });
    }
    const approve = interaction.customId.startsWith('feature_approve_');
    const guildId = interaction.customId.replace(/^feature_(approve|reject)_/, '');

    // Claim the request first so a double click cannot post twice
    const claimed = db.prepare(`
        UPDATE featured_servers SET status = ?, reviewed_at = datetime('now')
        WHERE guild_id = ? AND status = 'pending'
    `).run(approve ? 'approved' : 'rejected', guildId);
    const row = getFeatured(guildId);
    if (claimed.changes === 0 || !row) {
        return interaction.reply({ content: `Already handled (${row?.status || 'not found'}).`, flags: 64 });
    }

    if (!approve) {
        await interaction.update({ content: `❌ Rejected by <@${interaction.user.id}>`, components: [], allowedMentions: { parse: [] } });
        return notifyRequester(interaction.client, row, 'featureRejectedDm');
    }

    const listingChannel = await fetchTextChannel(interaction.client, process.env.FEATURED_SERVERS_CHANNEL_ID);
    const listing = listingChannel ? await listingChannel.send(buildListingMessage(row)).catch(() => null) : null;
    if (!listing) {
        db.prepare("UPDATE featured_servers SET status = 'pending', reviewed_at = NULL WHERE guild_id = ?").run(guildId);
        return interaction.reply({ content: '❌ Could not post the listing: set FEATURED_SERVERS_CHANNEL_ID to a channel the bot can send messages in.', flags: 64 });
    }

    db.prepare('UPDATE featured_servers SET listing_channel_id = ?, listing_message_id = ? WHERE guild_id = ?')
        .run(listing.channelId, listing.id, guildId);
    await interaction.update({ content: `✅ Approved by <@${interaction.user.id}>: ${listing.url}`, components: [], allowedMentions: { parse: [] } });
    return notifyRequester(interaction.client, row, 'featureApprovedDm');
}

// ── /server unfeature ─────────────────────────────────────────

async function handleUnfeatureCommand(interaction) {
    const language = getInteractionLanguage(interaction);
    if (!canManage(interaction)) {
        return interaction.reply({ content: `❌ ${t(language, 'featureNeedManageServer')}`, flags: 64 });
    }
    const row = getFeatured(interaction.guildId);
    if (!row || !['pending', 'approved'].includes(row.status)) {
        return interaction.reply({ content: t(language, 'featureNotListed'), flags: 64 });
    }

    await interaction.deferReply({ flags: 64 });
    if (row.listing_channel_id && row.listing_message_id) {
        const channel = await fetchTextChannel(interaction.client, row.listing_channel_id);
        await channel?.messages.delete(row.listing_message_id).catch(() => {});
    }
    db.prepare("UPDATE featured_servers SET status = 'removed', listing_message_id = NULL WHERE guild_id = ?").run(interaction.guildId);
    return interaction.editReply(`✅ ${t(language, 'featureRemoved')}`);
}

module.exports = {
    INVITE_PATTERN,
    getFeatured,
    handleFeatureCommand,
    handleFeatureModal,
    handleReviewButton,
    handleUnfeatureCommand,
};
