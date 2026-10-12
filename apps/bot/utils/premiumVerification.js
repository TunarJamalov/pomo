const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { db } = require('./database');
const { grantProAccess } = require('./premiumManager');
const { GardenPlotLimits } = require('./constants');
const { t, getInteractionLanguage, getUserLanguage } = require('./i18n');

const OWNER_ID = process.env.OWNER_ID;

// ─── Modal Submit Handler ─────────────────────────────────────────────────────
async function handleVerificationModalSubmit(interaction) {
    const userId    = interaction.user.id;
    const username  = interaction.user.tag;
    const boostyId  = interaction.fields.getTextInputValue('boosty_identifier').trim().replace(/`/g, '');
    const userNote  = interaction.fields.getTextInputValue('user_note')?.trim() || null;
    const now       = new Date().toISOString();

    // Several forms opened at once must not DM the owner several times
    const pending = db.prepare(
        `SELECT submitted_at FROM pro_verification_queue WHERE discord_id = ? AND status = 'PENDING'`
    ).get(userId);
    if (pending) {
        return interaction.reply({
            content: t(getInteractionLanguage(interaction), 'premiumActivatePending', {
                time: `<t:${Math.floor(new Date(pending.submitted_at).getTime() / 1000)}:R>`,
            }),
            flags: 64,
        });
    }

    db.prepare(`
        INSERT OR REPLACE INTO pro_verification_queue
          (discord_id, discord_username, boosty_identifier, submitted_at, status)
        VALUES (?, ?, ?, ?, 'PENDING')
    `).run(userId, username, boostyId, now);

    // DM the owner
    try {
        const owner = await interaction.client.users.fetch(OWNER_ID);
        const embed = new EmbedBuilder()
            .setTitle('🔔 New Pro Verification Request')
            .setColor(0xFFD700)
            .setTimestamp()
            .addFields(
                { name: 'Discord User',      value: `<@${userId}> (${username})`, inline: true  },
                { name: 'Discord ID',        value: `\`${userId}\``,              inline: true  },
                { name: 'Boosty Identifier', value: `\`${boostyId}\``,            inline: false },
                { name: 'User Note',         value: userNote || '_None_',         inline: false }
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pro_approve_${userId}`)
                .setLabel('✅ Approve 30 Days')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`pro_reject_${userId}`)
                .setLabel('❌ Reject')
                .setStyle(ButtonStyle.Danger)
        );

        await owner.send({ embeds: [embed], components: [row] });
    } catch (err) {
        console.error('[PremiumVerify] Could not DM owner:', err.message);
    }

    const language = getInteractionLanguage(interaction);
    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`✅ ${t(language, 'premiumVerifySubmittedTitle')}`)
            .setColor(0x57F287)
            .setDescription(t(language, 'premiumVerifySubmittedBody', { identifier: boostyId }))
        ],
        flags: 64
    });
}

// ─── Owner Approve Button ─────────────────────────────────────────────────────
async function handleOwnerApprove(interaction, targetUserId) {
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
    }

    const record = db.prepare(
        `SELECT * FROM pro_verification_queue WHERE discord_id = ? AND status = 'PENDING'`
    ).get(targetUserId);

    if (!record) {
        return interaction.update({ content: '⚠️ No pending request found. Already processed?', components: [] });
    }

    grantProAccess(targetUserId, 30, interaction.user.id, { source: 'boosty_manual', note: `Boosty: ${record.boosty_identifier}` });

    db.prepare(`
        UPDATE pro_verification_queue
        SET status = 'APPROVED', verified_by = 'OWNER_MANUAL', granted_days = 30, granted_at = datetime('now')
        WHERE discord_id = ? AND status = 'PENDING'
    `).run(targetUserId);

    // Welcome DM to user
    try {
        const targetUser = await interaction.client.users.fetch(targetUserId);
        await targetUser.send({ embeds: [buildProWelcomeEmbed(targetUser, getUserLanguage(targetUserId))] });
    } catch (err) {
        console.error(`[PremiumVerify] Could not DM user ${targetUserId}:`, err.message);
    }

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle('✅ Pro Granted')
            .setColor(0x57F287)
            .setDescription(`Pomo Pro activated for <@${targetUserId}> (30 days).\nBoosty: \`${record.boosty_identifier}\``)
            .setTimestamp()
        ],
        components: []
    });
}

// ─── Owner Reject Button ──────────────────────────────────────────────────────
async function handleOwnerReject(interaction, targetUserId) {
    if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({ content: '❌ Owner only.', ephemeral: true });
    }

    const record = db.prepare(
        `SELECT * FROM pro_verification_queue WHERE discord_id = ? AND status = 'PENDING'`
    ).get(targetUserId);

    if (!record) {
        return interaction.update({ content: '⚠️ No pending request found.', components: [] });
    }

    db.prepare(
        `UPDATE pro_verification_queue SET status = 'REJECTED' WHERE discord_id = ? AND status = 'PENDING'`
    ).run(targetUserId);

    try {
        const targetUser = await interaction.client.users.fetch(targetUserId);
        const language = getUserLanguage(targetUserId);
        await targetUser.send({
            embeds: [new EmbedBuilder()
                .setTitle(`❌ ${t(language, 'premiumVerifyRejectedTitle')}`)
                .setColor(0xED4245)
                .setDescription(t(language, 'premiumVerifyRejectedBody', { identifier: record.boosty_identifier }))
            ]
        });
    } catch (err) {}

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle('❌ Request Rejected')
            .setColor(0xED4245)
            .setDescription(`Rejected for <@${targetUserId}>. User has been notified.`)
            .setTimestamp()
        ],
        components: []
    });
}

// ─── Pro Welcome DM ───────────────────────────────────────────────────────────
function buildProWelcomeEmbed(user, language = 'en') {
    return new EmbedBuilder()
        .setTitle(`🎉 ${t(language, 'premiumWelcomeTitle')}`)
        .setColor(0xFFD700)
        .setDescription(t(language, 'premiumWelcomeBody', { username: user.username }))
        .addFields(
            { name: `🛡️ ${t(language, 'premiumWelcomeShieldsName')}`,  value: t(language, 'premiumWelcomeShieldsValue'), inline: false },
            { name: `🌱 ${t(language, 'premiumWelcomeGardenName')}`, value: t(language, 'premiumWelcomeGardenValue', { plots: GardenPlotLimits.PRO }), inline: false },
            { name: `🎭 ${t(language, 'premiumWelcomePersonaName')}`, value: t(language, 'premiumWelcomePersonaValue'), inline: false },
        )
        .setFooter({ text: t(language, 'premiumWelcomeFooter') });
}

module.exports = { handleVerificationModalSubmit, handleOwnerApprove, handleOwnerReject };
