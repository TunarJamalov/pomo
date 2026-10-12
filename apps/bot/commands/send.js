/**
 * /send - Request to send water to another user.
 * All transfers require owner approval via a private log channel.
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { getOrCreateUser, db, transactionManager, userRepository, identityRepository } = require('../utils/database');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const MIN_LEVEL = 3;
const MIN_AMOUNT = 10;
const MAX_AMOUNT = 2000;
const MIN_BALANCE_AFTER = 50;

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('send')
        .setDescription('Send water to another user (requires owner approval)')
        .addUserOption(o => o.setName('user').setDescription('Who to send water to').setRequired(true))
        .addIntegerOption(o => o.setName('amount').setDescription(`Amount to send (${MIN_AMOUNT}-${MAX_AMOUNT})`).setRequired(true).setMinValue(MIN_AMOUNT).setMaxValue(MAX_AMOUNT))
        .addStringOption(o => o.setName('reason').setDescription('Why are you sending this? (Required for approval)').setRequired(true).setMaxLength(200)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const senderId = interaction.user.id;
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const reason = interaction.options.getString('reason');

        if (targetUser.bot) {
            return interaction.reply({ embeds: [errorEmbed(t(language, 'invalidTargetTitle'), t(language, 'sendCannotBot'))], flags: 64 });
        }
        if (targetUser.id === senderId) {
            return interaction.reply({ embeds: [errorEmbed(t(language, 'invalidTargetTitle'), t(language, 'sendCannotSelf'))], flags: 64 });
        }

        const sender = getOrCreateUser(senderId);
        const receiver = getOrCreateUser(targetUser.id);

        if (sender.level < MIN_LEVEL) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'levelTooLowTitle'), t(language, 'sendLevelTooLowBody', { level: MIN_LEVEL }))],
                flags: 64,
            });
        }

        if (sender.water < amount + MIN_BALANCE_AFTER) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'insufficientWaterTitle'), t(language, 'sendInsufficientWaterBody', {
                    needed: amount + MIN_BALANCE_AFTER,
                    amount,
                    minimum: MIN_BALANCE_AFTER,
                    balance: sender.water,
                }))],
                flags: 64,
            });
        }

        const existing = db.prepare(`
            SELECT id FROM pending_transfers
            WHERE sender_id = ? AND status = 'pending'
        `).get(senderId);

        if (existing) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'requestPendingTitle'), t(language, 'sendPendingBody'))],
                flags: 64,
            });
        }

        const result = db.prepare(`
            INSERT INTO pending_transfers (sender_id, receiver_id, amount, reason)
            VALUES (?, ?, ?, ?)
        `).run(senderId, targetUser.id, amount, reason);

        const transferId = result.lastInsertRowid;
        const logChannelId = process.env.OWNER_LOG_CHANNEL_ID;
        if (!logChannelId) {
            db.prepare('DELETE FROM pending_transfers WHERE id = ?').run(transferId);
            return interaction.reply({ embeds: [errorEmbed(t(language, 'configErrorTitle'), t(language, 'sendNoLogConfigBody'))], flags: 64 });
        }

        const logChannel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        if (!logChannel) {
            db.prepare('DELETE FROM pending_transfers WHERE id = ?').run(transferId);
            return interaction.reply({ embeds: [errorEmbed(t(language, 'configErrorTitle'), t(language, 'sendLogMissingBody'))], flags: 64 });
        }

        const requestEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`💸 ${t(language, 'transferRequestTitle')}`)
            .addFields(
                { name: `👤 ${t(language, 'senderLabel')}`, value: `<@${senderId}> (Level ${sender.level} | ${sender.water} 💧)`, inline: true },
                { name: `🎯 ${t(language, 'receiverLabel')}`, value: `<@${targetUser.id}> (Level ${receiver.level} | ${receiver.water} 💧)`, inline: true },
                { name: `💧 ${t(language, 'amountLabel')}`, value: `**${amount} 💧**`, inline: true },
                { name: `📝 ${t(language, 'reasonLabel')}`, value: reason },
            )
            .setFooter({ text: `Transfer ID: #${transferId}` })
            .setTimestamp();

        const approveRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`transfer_approve_${transferId}`)
                .setLabel(`✅ ${t(language, 'approveButton')}`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`transfer_reject_${transferId}`)
                .setLabel(`❌ ${t(language, 'rejectButton')}`)
                .setStyle(ButtonStyle.Danger),
        );

        const logMessage = await logChannel.send({ embeds: [requestEmbed], components: [approveRow] });
        db.prepare('UPDATE pending_transfers SET log_message_id = ? WHERE id = ?').run(logMessage.id, transferId);

        const ackEmbed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`⏳ ${t(language, 'transferSubmittedTitle')}`)
            .setDescription(t(language, 'transferSubmittedBody', {
                amount,
                receiver: `<@${targetUser.id}>`,
                reason,
            }))
            .setTimestamp();

        await interaction.reply({ embeds: [ackEmbed], flags: 64 });
    },
};

async function handleTransferButton(interaction) {
    const language = getInteractionLanguage(interaction);
    if (interaction.user.id !== process.env.OWNER_ID) {
        return interaction.reply({ content: `❌ ${t(language, 'transferOwnerOnlyBody')}`, flags: 64 });
    }

    const customId = interaction.customId;
    const isApprove = customId.startsWith('transfer_approve_');
    const transferId = parseInt(customId.split('_')[2]);

    const transfer = db.prepare('SELECT * FROM pending_transfers WHERE id = ?').get(transferId);

    if (!transfer) {
        return interaction.update({ content: `⚠️ ${t(language, 'transferNotFoundBody')}`, embeds: [], components: [] });
    }

    if (transfer.status !== 'pending') {
        return interaction.update({
            embeds: [],
            components: [],
            content: t(language, 'transferAlreadyProcessedBody', { status: transfer.status }),
        });
    }

    // Claim the transfer before any await, so a double click cannot pay twice
    const claimed = db.prepare("UPDATE pending_transfers SET status = ? WHERE id = ? AND status = 'pending'")
        .run(isApprove ? 'processing' : 'rejected', transferId);
    if (claimed.changes === 0) {
        return interaction.update({
            embeds: [],
            components: [],
            content: t(language, 'transferAlreadyProcessedBody', { status: 'processed' }),
        });
    }

    if (isApprove) {
        try {
            await transactionManager.execute(async (ctx) => {
                const senderIdentity = await identityRepository.lookupIdentity('discord', transfer.sender_id, ctx);
                if (!senderIdentity) throw new Error('SENDER_NOT_FOUND');
                const success = await userRepository.deductWaterAtomic(senderIdentity, transfer.amount, ctx);
                if (!success) {
                    throw new Error('INSUFFICIENT_BALANCE');
                }
                const receiverIdentity = await identityRepository.lookupIdentity('discord', transfer.receiver_id, ctx);
                if (receiverIdentity) await userRepository.incrementField(receiverIdentity, 'water', transfer.amount, ctx);
            });
        } catch (err) {
            console.error(err); db.prepare("UPDATE pending_transfers SET status = 'rejected' WHERE id = ?").run(transferId);
            const failEmbed = new EmbedBuilder()
                .setColor(Colors.ERROR)
                .setTitle(`❌ ${t(language, 'transferFailedTitle')}`)
                .setDescription(t(language, 'transferFailedBody', { id: transferId }))
                .setTimestamp();
            await interaction.update({ embeds: [failEmbed], components: [] });
            return;
        }

        db.prepare("UPDATE pending_transfers SET status = 'approved' WHERE id = ?").run(transferId);

        const senderUser = await interaction.client.users.fetch(transfer.sender_id).catch(() => null);
        const receiverUser = await interaction.client.users.fetch(transfer.receiver_id).catch(() => null);

        const dmEmbed = (title, desc) => new EmbedBuilder().setColor(Colors.SUCCESS).setTitle(title).setDescription(desc).setTimestamp();

        if (senderUser) {
            senderUser.send({
                embeds: [dmEmbed(`💧 ${t(language, 'transferApprovedTitle')}`, t(language, 'transferApprovedSenderBody', {
                    amount: transfer.amount,
                    receiver: `<@${transfer.receiver_id}>`,
                    reason: transfer.reason,
                }))],
            }).catch(() => {});
        }
        if (receiverUser) {
            receiverUser.send({
                embeds: [dmEmbed(`💧 ${t(language, 'transferReceivedTitle')}`, t(language, 'transferReceivedBody', {
                    sender: `<@${transfer.sender_id}>`,
                    amount: transfer.amount,
                    reason: transfer.reason,
                }))],
            }).catch(() => {});
        }

        const approvedEmbed = new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setTitle(`✅ ${t(language, 'transferApprovedTitle')}`)
            .setDescription(t(language, 'transferApprovedLogBody', {
                amount: transfer.amount,
                sender: `<@${transfer.sender_id}>`,
                receiver: `<@${transfer.receiver_id}>`,
                reason: transfer.reason,
            }))
            .setFooter({ text: t(language, 'approvedByFooter', { user: interaction.user.tag, id: transferId }) })
            .setTimestamp();

        await interaction.update({ embeds: [approvedEmbed], components: [] });
    } else {
        const senderUser = await interaction.client.users.fetch(transfer.sender_id).catch(() => null);
        if (senderUser) {
            senderUser.send({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.ERROR)
                    .setTitle(`❌ ${t(language, 'transferRejectedTitle')}`)
                    .setDescription(t(language, 'transferRejectedSenderBody', {
                        amount: transfer.amount,
                        receiver: `<@${transfer.receiver_id}>`,
                        reason: transfer.reason,
                    }))
                    .setTimestamp()],
            }).catch(() => {});
        }

        const rejectedEmbed = new EmbedBuilder()
            .setColor(Colors.ERROR)
            .setTitle(`❌ ${t(language, 'transferRejectedTitle')}`)
            .setDescription(t(language, 'transferRejectedLogBody', {
                amount: transfer.amount,
                sender: `<@${transfer.sender_id}>`,
                receiver: `<@${transfer.receiver_id}>`,
                reason: transfer.reason,
            }))
            .setFooter({ text: t(language, 'rejectedByFooter', { user: interaction.user.tag, id: transferId }) })
            .setTimestamp();

        await interaction.update({ embeds: [rejectedEmbed], components: [] });
    }
}

module.exports.handleTransferButton = handleTransferButton;
