const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { getInteractionLanguage, t } = require('../utils/i18n');

const SUPPORT_SERVER_URL = 'https://discord.gg/XEubrrkBmB';
const TYPE_LABELS = {
    bug: 'Bug report',
    suggestion: 'Suggestion',
    question: 'Question',
};

module.exports = {
    cooldown: 60,
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('Send a bug report, suggestion, or question to the PomoBot team')
        .addStringOption(option => option
            .setName('type')
            .setDescription('What kind of feedback is this?')
            .setRequired(true)
            .addChoices(
                { name: 'Bug report', value: 'bug' },
                { name: 'Suggestion', value: 'suggestion' },
                { name: 'Question', value: 'question' },
            ))
        .addStringOption(option => option
            .setName('message')
            .setDescription('Describe the issue or idea clearly')
            .setRequired(true)
            .setMinLength(10)
            .setMaxLength(1000))
        .addBooleanOption(option => option
            .setName('contact')
            .setDescription('Allow the team to contact you about this feedback')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const type = interaction.options.getString('type');
        const message = interaction.options.getString('message');
        const contact = interaction.options.getBoolean('contact') ?? true;
        const channelId = getFeedbackChannelId();

        if (!channelId) {
            return interaction.reply({
                embeds: [buildUnavailableEmbed(language)],
                components: [buildSupportRow(language)],
                flags: 64,
            });
        }

        await interaction.deferReply({ flags: 64 });

        const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased?.()) {
            return interaction.editReply({
                embeds: [buildUnavailableEmbed(language)],
                components: [buildSupportRow(language)],
            });
        }

        const embed = buildFeedbackEmbed(interaction, type, message, contact);
        // With contact allowed, the team can answer from the channel through the bot
        const { buildOwnerReplyRow } = require('../utils/feedbackReplies');
        await channel.send({
            embeds: [embed],
            components: contact ? [buildOwnerReplyRow(interaction.user.id)] : [],
            allowedMentions: { parse: [] },
        });

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.SUCCESS)
                .setTitle(t(language, 'feedbackSentTitle'))
                .setDescription(t(language, 'feedbackSentBody'))],
            components: [buildSupportRow(language)],
        });
    },
};

function getFeedbackChannelId() {
    return process.env.FEEDBACK_CHANNEL_ID
        || process.env.BUG_REPORT_CHANNEL_ID
        || process.env.OWNER_LOG_CHANNEL_ID
        || process.env.LOG_CHANNEL_ID
        || '';
}

function buildFeedbackEmbed(interaction, type, message, contact) {
    const guildName = interaction.guild?.name || 'DM';
    const guildId = interaction.guild?.id || 'DM';
    const channelName = interaction.channel?.name ? `#${interaction.channel.name}` : 'DM or unknown';
    const typeLabel = TYPE_LABELS[type] || TYPE_LABELS.question;

    const embed = new EmbedBuilder()
        .setColor(type === 'bug' ? Colors.ERROR : type === 'suggestion' ? Colors.INFO : Colors.PRIMARY)
        .setTitle(`PomoBot ${typeLabel}`)
        .setDescription(message)
        .addFields(
            { name: 'Server', value: `${guildName}\n\`${guildId}\``, inline: true },
            { name: 'Channel', value: channelName, inline: true },
            { name: 'Contact allowed', value: contact ? 'Yes' : 'No', inline: true },
            {
                name: 'User',
                value: contact
                    ? `<@${interaction.user.id}> (${interaction.user.tag || interaction.user.id})`
                    : `${interaction.user.tag || 'Anonymous'}\n\`${interaction.user.id}\``,
                inline: false,
            },
        )
        .setTimestamp();

    return embed;
}

function buildUnavailableEmbed(language = 'en') {
    return new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(t(language, 'feedbackUnavailableTitle'))
        .setDescription(t(language, 'feedbackUnavailableBody'));
}

function buildSupportRow(language = 'en') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(t(language, 'feedbackSupportButton'))
            .setStyle(ButtonStyle.Link)
            .setURL(SUPPORT_SERVER_URL),
    );
}

module.exports.buildFeedbackEmbed = buildFeedbackEmbed;
module.exports.getFeedbackChannelId = getFeedbackChannelId;
