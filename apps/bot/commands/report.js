const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { Colors } = require('../utils/constants');
const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
const { generateWeeklyReportEmbed } = require('../utils/weeklyReport');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Manage weekly server study reports')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Enable weekly reports and set the output channel')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel where the report should be sent')
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('disable')
                .setDescription('Disable weekly reports for this server')
        )
        .addSubcommand(sub =>
            sub.setName('preview')
                .setDescription('Generate and preview the weekly report right now')
        ),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return interaction.reply({ content: `X ${t(language, 'reportPermissionBody')}`, flags: 64 });
        }

        const sub = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (sub === 'setup') {
            return handleSetup(interaction, language, guildId);
        }
        if (sub === 'disable') {
            return handleDisable(interaction, language, guildId);
        }
        if (sub === 'preview') {
            return handlePreview(interaction, language, guildId);
        }
    },
};

async function handleSetup(interaction, language, guildId) {
    const channel = interaction.options.getChannel('channel');
    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
    ])) {
        return interaction.reply({
            content: `X ${t(language, 'reportChannelPermissionBody', { channel })}`,
            flags: 64,
        });
    }

    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, {
        report_channel_id: channel.id,
        report_enabled: 1,
        guild_name: interaction.guild.name,
    });
    const settings = getOrCreateGuildSettings(guildId);

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'reportEnabledTitle'))
        .setDescription(t(language, 'reportEnabledBody', {
            channel: `<#${channel.id}>`,
            timezone: settings.timezone || 'UTC',
        }))
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleDisable(interaction, language, guildId) {
    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, { report_enabled: 0 });

    const embed = new EmbedBuilder()
        .setColor(Colors.ERROR)
        .setTitle(t(language, 'reportDisabledTitle'))
        .setDescription(t(language, 'reportDisabledBody'))
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handlePreview(interaction, language, guildId) {
    await interaction.deferReply();

    try {
        const settings = getOrCreateGuildSettings(guildId);
        const embed = generateWeeklyReportEmbed(guildId, interaction.guild.name, {
            timeZone: settings.timezone || 'UTC',
        });

        if (!embed) {
            return interaction.editReply({ content: t(language, 'reportNotEnoughData') });
        }

        return interaction.editReply({ content: `**${t(language, 'reportPreviewTitle')}**`, embeds: [embed] });
    } catch (error) {
        console.error('[REPORT] Preview error:', error);
        return interaction.editReply({ content: t(language, 'reportPreviewError') });
    }
}
