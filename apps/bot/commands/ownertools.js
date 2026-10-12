/**
 * /ownertools — owner-only actions that used to be subcommands of public
 * commands (/season start, /event start). Registered only in the owner's
 * guild (see deploy-commands.js), so regular servers never see it.
 */
const { SlashCommandBuilder } = require('discord.js');
const { handleSeasonStart } = require('./season');
const { handleStart: handleEventStart } = require('./event');

module.exports = {
    ownerOnly: true,
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('ownertools')
        .setDescription('Owner-only admin actions')
        .addSubcommand(sub => sub
            .setName('season_start')
            .setDescription('Archive the current season and start a new one')
            .addStringOption(option => option
                .setName('name')
                .setDescription('The name of the new season (e.g., Spring Season 1)')
                .setRequired(true)))
        .addSubcommand(sub => sub
            .setName('event_start')
            .setDescription('Start a classified global event')
            .addStringOption(option => option
                .setName('key')
                .setDescription('Unique event key')
                .setRequired(true)
                .setMaxLength(40))
            .addStringOption(option => option
                .setName('title')
                .setDescription('Public event title')
                .setRequired(true)
                .setMaxLength(120))
            .addIntegerOption(option => option
                .setName('target')
                .setDescription('Global focus minutes required')
                .setRequired(true)
                .setMinValue(100)
                .setMaxValue(1000000)))
        .addSubcommand(sub => sub
            .setName('reply')
            .setDescription('DM a user as Pomo (e.g. to answer older feedback)')
            .addUserOption(option => option
                .setName('user')
                .setDescription('User to message (you can paste their ID)')
                .setRequired(true))
            .addStringOption(option => option
                .setName('message')
                .setDescription('Your message')
                .setRequired(true)
                .setMaxLength(1500))),

    async execute(interaction) {
        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({ content: '❌ Owner only.', flags: 64 });
        }
        const sub = interaction.options.getSubcommand();
        if (sub === 'season_start') return handleSeasonStart(interaction);
        if (sub === 'event_start') return handleEventStart(interaction);
        if (sub === 'reply') return require('../utils/feedbackReplies').handleOwnerReplyCommand(interaction);
        return interaction.reply({ content: 'Unknown action.', flags: 64 });
    },
};
