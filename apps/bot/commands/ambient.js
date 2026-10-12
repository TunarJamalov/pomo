/**
 * /ambient - Select and receive ambient study sounds.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    AttachmentBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { AmbientSounds } = require('../utils/constants');
const { errorEmbed, infoEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const path = require('path');
const fs = require('fs');

const SAFE_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const AMBIENT_BASE_URL = 'https://pomofocus.online/audio';

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('ambient')
        .setDescription('Get ambient background sounds for studying'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const options = Object.entries(AmbientSounds).map(([key, sound]) => ({
            label: sound.name,
            value: key,
            emoji: sound.emoji,
            description: t(language, 'ambientOptionDescription', { sound: sound.name }),
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ambient_select')
                .setPlaceholder(t(language, 'ambientPlaceholder'))
                .addOptions(options)
        );

        const embed = infoEmbed(
            t(language, 'ambientTitle'),
            `${t(language, 'ambientBody')}\n\n` +
            Object.values(AmbientSounds).map(sound => `${sound.emoji} **${sound.name}**`).join('\n')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};

async function handleAmbientSelect(interaction) {
    const language = getInteractionLanguage(interaction);
    const key = interaction.values[0];
    const sound = AmbientSounds[key];

    if (!sound) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'ambientInvalidTitle'), t(language, 'ambientInvalidBody'))],
            flags: 64,
        });
    }

    const filePath = path.join(__dirname, '..', 'assets', 'ambient', sound.file);
    if (!fs.existsSync(filePath)) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'ambientFileMissingTitle'), t(language, 'ambientFileMissingBody', { sound: sound.name }))],
            flags: 64,
        });
    }

    await interaction.deferUpdate();

    const fileSize = fs.statSync(filePath).size;
    if (fileSize > SAFE_ATTACHMENT_BYTES) {
        return sendAmbientLink(interaction, sound, language);
    }

    try {
        const attachment = new AttachmentBuilder(filePath, { name: sound.file });
        await interaction.followUp({
            content: t(language, 'ambientEnjoyBody', { sound: `${sound.emoji} **${sound.name}**` }),
            files: [attachment],
        });
    } catch (error) {
        if (error.code === 40005 || error.status === 413) {
            return sendAmbientLink(interaction, sound, language);
        }
        throw error;
    }
}

async function sendAmbientLink(interaction, sound, language = getInteractionLanguage(interaction)) {
    const url = `${AMBIENT_BASE_URL}/${encodeURIComponent(sound.file)}`;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel(t(language, 'ambientPlayButton', { sound: sound.name }))
            .setStyle(ButtonStyle.Link)
            .setURL(url),
    );

    await interaction.followUp({
        content: t(language, 'ambientOpenBrowserBody', { sound: `${sound.emoji} **${sound.name}**` }),
        components: [row],
        flags: 64,
    });
}

module.exports.handleAmbientSelect = handleAmbientSelect;
module.exports.sendAmbientLink = sendAmbientLink;
module.exports.SAFE_ATTACHMENT_BYTES = SAFE_ATTACHMENT_BYTES;
