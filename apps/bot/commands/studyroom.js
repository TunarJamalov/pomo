const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { Colors } = require('../utils/constants');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('studyroom')
        .setDescription('Dynamic voice study rooms')
        .addSubcommand(sub => sub
            .setName('create')
            .setDescription('Create a temporary voice channel for your study session')
            .addStringOption(option =>
                option.setName('name')
                    .setDescription('Name of your study room')
                    .setRequired(false))
            .addIntegerOption(option =>
                option.setName('limit')
                    .setDescription('Max number of users allowed in the room (0 for unlimited)')
                    .setRequired(false)
                    .setMinValue(0)
                    .setMaxValue(99))
            .addBooleanOption(option =>
                option.setName('private')
                    .setDescription('Make the room private? Only people you invite can join')
                    .setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Set the category where study rooms will be created (Admin only)')
            .addChannelOption(option =>
                option.setName('category')
                    .setDescription('The category to group all study rooms in')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildCategory))
        )
        .addSubcommand(sub => sub
            .setName('trigger')
            .setDescription('Set or clear the join-to-create trigger channel (Admin only)')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('Voice channel where users join to auto-create a private voice room')
                    .addChannelTypes(ChannelType.GuildVoice))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'setup') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed('Permission Denied', 'You need the Manage Server permission to set up the studyroom category.')],
                    flags: 64,
                });
            }

            const category = interaction.options.getChannel('category');
            updateGuildSettings(interaction.guildId, { studyroom_category_id: category.id });

            return interaction.reply({
                embeds: [successEmbed('Study Rooms Configured', `Temporary study rooms will now be created in the **${category.name}** category.`)],
                flags: 64,
            });
        }

        if (subcommand === 'trigger') {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    embeds: [errorEmbed('Permission Denied', 'You need the Manage Server permission to configure the trigger channel.')],
                    flags: 64,
                });
            }

            const channel = interaction.options.getChannel('channel');
            if (!channel) {
                updateGuildSettings(interaction.guildId, { studyroom_trigger_id: null });
                return interaction.reply({
                    embeds: [successEmbed('Trigger Channel Cleared', 'Join-to-create is now disabled.')],
                    flags: 64,
                });
            }

            const settings = getOrCreateGuildSettings(interaction.guildId);
            if (!settings.studyroom_category_id) {
                return interaction.reply({
                    embeds: [errorEmbed('Category Required', 'Run `/studyroom setup category:<category>` first to set where rooms are created.')],
                    flags: 64,
                });
            }

            updateGuildSettings(interaction.guildId, { studyroom_trigger_id: channel.id });
            return interaction.reply({
                embeds: [successEmbed(
                    'Trigger Channel Set',
                    `When a user joins ${channel}, a private study room will be auto-created in **${channel.guild.channels.cache.get(settings.studyroom_category_id)?.name || 'the configured category'}**.`
                )],
                flags: 64,
            });
        }

        if (subcommand === 'create') {
            const existingRoom = interaction.guild.channels.cache.find(c =>
                c.type === ChannelType.GuildVoice &&
                c.name.startsWith('🔴') &&
                c.permissionOverwrites.cache.some(ow =>
                    ow.id === interaction.user.id &&
                    ow.allow.has(PermissionFlagsBits.ManageChannels)
                )
            );

            if (existingRoom) {
                return interaction.reply({
                    embeds: [errorEmbed('Already Exists', `You already have an active study room: <#${existingRoom.id}>.`)],
                    flags: 64,
                });
            }

            const settings = getOrCreateGuildSettings(interaction.guildId);
            let categoryId = settings.studyroom_category_id;

            if (!categoryId && interaction.channel.parentId) {
                categoryId = interaction.channel.parentId;
            }

            const roomName = interaction.options.getString('name')
                ? `🔴 ${interaction.options.getString('name')}`
                : `🔴 ${interaction.user.username}'s Room`;

            const userLimit = interaction.options.getInteger('limit') || 0;
            const isPrivate = interaction.options.getBoolean('private') || false;

            const permissionOverwrites = [
                {
                    id: interaction.guild.id,
                    allow: isPrivate ? [] : [PermissionFlagsBits.Connect],
                    deny: isPrivate ? [PermissionFlagsBits.Connect] : [],
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.MoveMembers],
                },
            ];

            permissionOverwrites.push({
                id: interaction.client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels],
            });

            try {
                const channel = await interaction.guild.channels.create({
                    name: roomName,
                    type: ChannelType.GuildVoice,
                    parent: categoryId,
                    userLimit: userLimit,
                    permissionOverwrites: permissionOverwrites,
                });

                const embed = new EmbedBuilder()
                    .setColor(Colors.SUCCESS)
                    .setTitle(`🎙️ Study Room Created!`)
                    .setDescription(`Your temporary study room <#${channel.id}> is ready.\n\nJoin within 5 minutes or it will be automatically deleted!`)
                    .setFooter({ text: 'The room will be deleted when everyone leaves.' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                setTimeout(async () => {
                    try {
                        const checkChannel = await interaction.guild.channels.fetch(channel.id).catch(() => null);
                        if (checkChannel && checkChannel.members.size === 0) {
                            await checkChannel.delete('Study room was empty for 5 minutes after creation');
                        }
                    } catch (e) {}
                }, 5 * 60 * 1000);
            } catch (error) {
                return interaction.reply({
                    embeds: [errorEmbed('Creation Failed', 'Could not create the voice channel. Please ensure I have "Manage Channels" permissions in the selected category.')],
                    flags: 64,
                });
            }
        }
    },
};
