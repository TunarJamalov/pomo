/**
 * /announce - Owner-only structured DM announcement.
 * Preview is the default; confirm must be true before a broadcast starts.
 */

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { db } = require('../utils/database');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

const COLOR_MAP = {
    blue: 0x5865F2,
    green: 0x57F287,
    red: 0xED4245,
    purple: 0x9B59B6,
    yellow: 0xFEE75C,
};

module.exports = {
    ownerOnly: true,
    cooldown: 30,
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Preview or send a structured DM announcement (Owner only)')
        .addStringOption(option => option
            .setName('title')
            .setDescription('Announcement title')
            .setRequired(true)
            .setMaxLength(256))
        .addStringOption(option => option
            .setName('message')
            .setDescription('Short introduction shown above the announcement sections')
            .setRequired(true)
            .setMaxLength(1500))
        .addStringOption(option => option
            .setName('features')
            .setDescription('Feature list separated with | characters')
            .setRequired(false)
            .setMaxLength(2000))
        .addStringOption(option => option
            .setName('giveaway')
            .setDescription('Optional giveaway details')
            .setRequired(false)
            .setMaxLength(1000))
        .addStringOption(option => option
            .setName('button_url')
            .setDescription('Optional link button URL')
            .setRequired(false)
            .setMaxLength(512))
        .addStringOption(option => option
            .setName('button_label')
            .setDescription('Optional button text (default: Learn More)')
            .setRequired(false)
            .setMaxLength(80))
        .addStringOption(option => option
            .setName('color')
            .setDescription('Embed color theme')
            .setRequired(false)
            .addChoices(
                { name: 'Blue', value: 'blue' },
                { name: 'Green', value: 'green' },
                { name: 'Red', value: 'red' },
                { name: 'Purple', value: 'purple' },
                { name: 'Yellow', value: 'yellow' },
            ))
        .addBooleanOption(option => option
            .setName('ping')
            .setDescription('Send @everyone in the current channel before the DM broadcast')
            .setRequired(false))
        .addBooleanOption(option => option
            .setName('confirm')
            .setDescription('Set true to send; false previews only')
            .setRequired(false)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'unauthorizedTitle'), t(language, 'ownerOnlyCommandBody'))],
                flags: 64,
            });
        }

        const input = getAnnouncementInput(interaction);
        let payload;
        try {
            payload = buildAnnouncementPayload(input);
        } catch (error) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'invalidAnnouncementTitle'), error.message)],
                flags: 64,
            });
        }

        if (!input.confirm) {
            return interaction.reply({
                content: t(language, 'announcementPreviewOnlyBody'),
                ...payload,
                flags: 64,
            });
        }

        const users = db.prepare('SELECT discord_id FROM users WHERE discord_id IS NOT NULL').all();
        if (users.length === 0) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'noUsersTitle'), t(language, 'noUsersBody'))],
                flags: 64,
            });
        }

        if (input.ping && interaction.channel) {
            await interaction.channel.send('@everyone').catch(() => {});
        }

        await interaction.reply({
            embeds: [buildProgressEmbed(0, 0, users.length, 0, language)],
            flags: 64,
        });

        const interactionDeadline = Date.now() + (14 * 60 * 1000);
        let sent = 0;
        let failed = 0;
        let firstError = null;

        for (let index = 0; index < users.length; index++) {
            try {
                const discordUser = await interaction.client.users.fetch(users[index].discord_id);
                await discordUser.send(payload);
                sent++;
            } catch (error) {
                failed++;
                if (!firstError) firstError = error.message || 'Unknown Error';
                const expectedDmFailure = error.code === 50007
                    || error.message?.includes('Cannot send messages to this user')
                    || error.message?.includes('no mutual guilds');
                if (!expectedDmFailure) {
                    console.error(`[ANNOUNCE] Failed DM to ${users[index].discord_id}: ${error.message}`);
                }
            }

            if (Date.now() < interactionDeadline && ((index + 1) % 20 === 0 || index === users.length - 1)) {
                await interaction.editReply({
                    embeds: [buildProgressEmbed(sent, failed, users.length, index + 1, language)],
                    components: [],
                }).catch(() => {});
            }

            if (index < users.length - 1) {
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 1000) + 1500));
            }
        }

        const finalPayload = {
            embeds: [new EmbedBuilder()
                .setColor(Colors.SUCCESS)
                .setTitle(t(language, 'announcementCompleteTitle'))
                .setDescription(
                    `**${t(language, 'sentLabel')}:** ${sent}\n` +
                    `**${t(language, 'failedLabel')}:** ${failed} (${t(language, 'dmFailureReason')})\n` +
                    `**${t(language, 'totalLabel')}:** ${users.length}` +
                    (firstError ? `\n\n**${t(language, 'sampleErrorLabel')}:** \`${firstError}\`` : '')
                )
                .setTimestamp()],
            components: [],
        };

        if (Date.now() < interactionDeadline) {
            await interaction.editReply(finalPayload).catch(() => {});
        } else {
            const owner = await interaction.client.users.fetch(interaction.user.id).catch(() => null);
            if (owner) await owner.send(finalPayload).catch(() => {});
        }
    },
};

function getAnnouncementInput(interaction) {
    return {
        title: interaction.options.getString('title', true),
        message: interaction.options.getString('message', true),
        features: interaction.options.getString('features'),
        giveaway: interaction.options.getString('giveaway'),
        buttonUrl: interaction.options.getString('button_url'),
        buttonLabel: interaction.options.getString('button_label') || 'Learn More',
        color: COLOR_MAP[interaction.options.getString('color') || 'blue'] || COLOR_MAP.blue,
        ping: interaction.options.getBoolean('ping') || false,
        confirm: interaction.options.getBoolean('confirm') || false,
    };
}

function buildAnnouncementPayload(input) {
    const embed = new EmbedBuilder()
        .setColor(input.color || COLOR_MAP.blue)
        .setTitle(cleanText(input.title))
        .setDescription(cleanText(input.message))
        .setFooter({ text: 'PomoBot | pomofocus.online' })
        .setTimestamp();

    const features = parseList(input.features);
    if (features.length > 0) {
        const featureText = features.map(item => `- ${item}`).join('\n');
        if (featureText.length > 1024) {
            throw new Error('The formatted feature list is too long. Keep it under 1,024 characters.');
        }
        embed.addFields({
            name: "What's New",
            value: featureText,
            inline: false,
        });
    }

    if (input.giveaway) {
        embed.addFields({
            name: 'Pomo Pro Giveaway',
            value: cleanText(input.giveaway),
            inline: false,
        });
    }

    const payload = { embeds: [embed] };
    if (input.buttonUrl) {
        if (!isSafeHttpUrl(input.buttonUrl)) {
            throw new Error('Button URL must start with http:// or https://.');
        }
        payload.components = [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(cleanText(input.buttonLabel || 'Learn More'))
                .setStyle(ButtonStyle.Link)
                .setURL(input.buttonUrl)
        )];
    }
    return payload;
}

function parseList(value) {
    if (!value) return [];
    return value
        .replace(/\\n/g, '\n')
        .split(/\s*\|\s*|\r?\n/)
        .map(item => item.replace(/^[-*\u2022]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, 15);
}

function cleanText(value) {
    return String(value || '').replace(/\\n/g, '\n').trim();
}

function isSafeHttpUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function buildProgressEmbed(sent, failed, total, processed, language = 'en') {
    const percent = total > 0 ? Math.round((processed / total) * 100) : 0;
    const filled = Math.round(percent / 5);
    const bar = '#'.repeat(filled) + '-'.repeat(20 - filled);

    return new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle(t(language, 'sendingAnnouncementTitle'))
        .setDescription(
            `\`${bar}\` **${percent}%**\n\n` +
            `${t(language, 'sentLabel')}: **${sent}** | ${t(language, 'failedLabel')}: **${failed}** | ${t(language, 'totalLabel')}: **${total}**`
        )
        .setTimestamp();
}

module.exports.buildAnnouncementPayload = buildAnnouncementPayload;
module.exports.parseList = parseList;
module.exports.isSafeHttpUrl = isSafeHttpUrl;
