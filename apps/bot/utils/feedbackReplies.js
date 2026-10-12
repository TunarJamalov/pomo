/**
 * Two-way conversation about /feedback, carried by the bot so the team never
 * needs to add users as friends:
 *   feedback channel  --[💬 Reply]-->  DM to the user
 *   DM to the user    --[💬 Reply]-->  feedback channel (with a Reply button again)
 * Only OWNER_ID can reply from the feedback channel.
 */
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { Colors, SUPPORT_SERVER_URL } = require('./constants');
const { t, getUserLanguage, getInteractionLanguage } = require('./i18n');

const MAX_LENGTH = 1500;
const USER_REPLY_COOLDOWN_MS = 60 * 1000;
const lastUserReplyAt = new Map();

function isOwner(interaction) {
    return Boolean(process.env.OWNER_ID) && interaction.user.id === process.env.OWNER_ID;
}

function getFeedbackChannelId() {
    return require('../commands/feedback').getFeedbackChannelId();
}

/** Button under a feedback message in the team's channel. */
function buildOwnerReplyRow(userId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`fb_reply_${userId}`)
            .setLabel('Reply')
            .setEmoji('💬')
            .setStyle(ButtonStyle.Primary),
    );
}

function buildTextModal(customId, title, label) {
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(title.slice(0, 45))
        .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('text')
                .setLabel(label.slice(0, 45))
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(2)
                .setMaxLength(MAX_LENGTH)
                .setRequired(true),
        ));
}

/** DMs the team's reply to the user. Returns true when it was delivered. */
async function sendReplyToUser(client, userId, text, originalMessage = null) {
    const language = getUserLanguage(userId);
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return false;

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`💬 ${t(language, 'feedbackReplyTitle')}`)
        .setDescription(text)
        .setFooter({ text: t(language, 'feedbackReplyFooter') })
        .setTimestamp();
    if (originalMessage) {
        embed.addFields({ name: t(language, 'feedbackReplyYourMessage'), value: originalMessage.slice(0, 1000) });
    }
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('fb_user_reply')
            .setLabel(t(language, 'feedbackReplyButton'))
            .setEmoji('💬')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setLabel(t(language, 'feedbackSupportButton'))
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_SERVER_URL),
    );
    return user.send({ embeds: [embed], components: [row] }).then(() => true).catch(() => false);
}

// ── Team side ─────────────────────────────────────────────────

async function handleOwnerReplyButton(interaction) {
    if (!isOwner(interaction)) {
        return interaction.reply({ content: 'Only the bot owner can reply to feedback.', flags: 64 });
    }
    const userId = interaction.customId.slice('fb_reply_'.length);
    return interaction.showModal(buildTextModal(`fb_reply_modal_${userId}`, 'Reply to feedback', 'Your reply (sent as a DM)'));
}

async function handleOwnerReplyModal(interaction) {
    if (!isOwner(interaction)) {
        return interaction.reply({ content: 'Only the bot owner can reply to feedback.', flags: 64 });
    }
    const userId = interaction.customId.slice('fb_reply_modal_'.length);
    const text = interaction.fields.getTextInputValue('text');
    const original = interaction.message?.embeds?.[0]?.description || null;

    await interaction.deferReply();
    const delivered = await sendReplyToUser(interaction.client, userId, text, original);
    if (!delivered) {
        return interaction.editReply({
            content: `❌ Could not DM <@${userId}>: they have DMs closed or no longer share a server with Pomo.`,
            allowedMentions: { parse: [] },
        });
    }
    return interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.SUCCESS)
            .setAuthor({ name: `Reply sent to ${userId}` })
            .setDescription(text)
            .setTimestamp()],
        allowedMentions: { parse: [] },
    });
}

/** /ownertools reply: message any user directly (e.g. older feedback without a button). */
async function handleOwnerReplyCommand(interaction) {
    const target = interaction.options.getUser('user', true);
    const text = interaction.options.getString('message', true);
    await interaction.deferReply({ flags: 64 });
    const delivered = await sendReplyToUser(interaction.client, target.id, text);
    return interaction.editReply(delivered
        ? `✅ Reply sent to ${target.tag || target.id}.`
        : `❌ Could not DM ${target.tag || target.id}: they have DMs closed or no longer share a server with Pomo.`);
}

// ── User side ─────────────────────────────────────────────────

async function handleUserReplyButton(interaction) {
    const language = getInteractionLanguage(interaction);
    return interaction.showModal(buildTextModal('fb_user_modal', t(language, 'feedbackReplyModalTitle'), t(language, 'feedbackReplyModalLabel')));
}

async function handleUserReplyModal(interaction) {
    const language = getInteractionLanguage(interaction);
    // Keeps one user from flooding the team's feedback channel
    const waitMs = (lastUserReplyAt.get(interaction.user.id) || 0) + USER_REPLY_COOLDOWN_MS - Date.now();
    if (waitMs > 0) {
        return interaction.reply({
            content: t(language, 'interactionCooldownBody', { seconds: Math.ceil(waitMs / 1000), command: 'feedback' }),
            flags: 64,
        });
    }
    lastUserReplyAt.set(interaction.user.id, Date.now());
    const text = interaction.fields.getTextInputValue('text');
    const channelId = getFeedbackChannelId();
    const channel = channelId ? await interaction.client.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased?.()) {
        return interaction.reply({ content: t(language, 'feedbackUnavailableBody'), flags: 64 });
    }

    await channel.send({
        embeds: [new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle('PomoBot feedback reply')
            .setDescription(text)
            .addFields({ name: 'User', value: `<@${interaction.user.id}> (${interaction.user.tag || interaction.user.id})` })
            .setTimestamp()],
        components: [buildOwnerReplyRow(interaction.user.id)],
        allowedMentions: { parse: [] },
    });
    return interaction.reply({ content: `✅ ${t(language, 'feedbackReplyDeliveredBody')}`, flags: 64 });
}

module.exports = {
    buildOwnerReplyRow,
    sendReplyToUser,
    handleOwnerReplyButton,
    handleOwnerReplyModal,
    handleOwnerReplyCommand,
    handleUserReplyButton,
    handleUserReplyModal,
};
