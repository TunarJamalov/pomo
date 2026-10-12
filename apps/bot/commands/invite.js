const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { getBotInviteUrl, getUserInstallUrl } = require('../utils/invite');
const { getInteractionLanguage, t } = require('../utils/i18n');

const SETUP_GUIDE_URL = 'https://pomofocus.online/tutorials/getting-started';
const SUPPORT_SERVER_URL = 'https://discord.gg/XEubrrkBmB';

module.exports = {
    cooldown: 10,
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the PomoBot invite link and quick setup guide'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const clientId = interaction.client.application?.id
            || interaction.client.user?.id
            || process.env.CLIENT_ID;
        const inviteUrl = getBotInviteUrl(clientId);

        const embed = new EmbedBuilder()
            .setColor(Colors.PRIMARY)
            .setTitle(t(language, 'inviteTitle'))
            .setDescription(t(language, 'inviteBody'))
            .addFields(
                {
                    name: t(language, 'inviteSetupTitle'),
                    value: t(language, 'inviteSetupBody'),
                    inline: false,
                },
                {
                    name: t(language, 'invitePermissionsTitle'),
                    value: t(language, 'invitePermissionsBody'),
                    inline: false,
                },
                {
                    name: '⚡ Sponsored by',
                    value: '[AzeDev](https://azedev.com/links) — Supporting open-source projects from Azerbaijan 🇦🇿',
                    inline: false,
                },
            )
            .setFooter({ text: t(language, 'inviteFooter') })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(t(language, 'inviteAddButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl),
            new ButtonBuilder()
                .setLabel(t(language, 'inviteUserInstallButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(getUserInstallUrl(clientId)),
            new ButtonBuilder()
                .setLabel(t(language, 'inviteGuideButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(SETUP_GUIDE_URL),
            new ButtonBuilder()
                .setLabel(t(language, 'inviteSupportButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(SUPPORT_SERVER_URL),
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    },
};
