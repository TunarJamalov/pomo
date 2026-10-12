const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getActiveGlobalEvent,
    getRecentlyCompletedGlobalEvent,
    getEventTheme,
    startGlobalEvent,
    getGlobalEventClues,
} = require('../utils/database');
const { Colors } = require('../utils/constants');
const { errorEmbed, progressBar, successEmbed } = require('../utils/embeds');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('View the classified global Pomo event')
        .setDMPermission(false)
        .addSubcommand(subcommand => subcommand
            .setName('status')
            .setDescription('View the current classified event progress'))
        .addSubcommand(subcommand => subcommand
            .setName('clues')
            .setDescription('View all unlocked classified event clues'))
,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'start') return handleStart(interaction);

        // A finished event stays visible for a few days so people can see the result
        const event = getActiveGlobalEvent() || getRecentlyCompletedGlobalEvent(3);
        if (!event) {
            return interaction.reply({
                embeds: [errorEmbed('No Active Event', 'There is no Pomo event running right now.')],
                flags: 64,
            });
        }

        if (subcommand === 'clues') return handleClues(interaction, event);
        return handleStatus(interaction, event);
    },
};

async function handleStart(interaction) {
    if (interaction.user.id !== process.env.OWNER_ID) {
        return interaction.reply({
            embeds: [errorEmbed('Owner Only', 'Only the bot owner can start a global event.')],
            flags: 64,
        });
    }

    const result = startGlobalEvent({
        eventKey: interaction.options.getString('key', true),
        title: interaction.options.getString('title', true),
        description: 'A classified focus protocol has been detected. Study together to reveal what is waiting behind the locks.',
        targetMinutes: interaction.options.getInteger('target', true),
    });
    if (!result.success) {
        const message = result.reason === 'active_exists'
            ? 'Another global event is already active.'
            : result.reason === 'already_exists'
                ? 'An event with that key already exists.'
                : 'Invalid event details.';
        return interaction.reply({ embeds: [errorEmbed('Event Not Started', message)], flags: 64 });
    }

    const { emoji } = getEventTheme(result.event.event_key);
    return interaction.reply({
        embeds: [successEmbed(
            `${emoji} Event Started`,
            `**${result.event.title}** is now active.\n\nUse \`/event status\` to follow the progress.`,
        )],
    });
}

async function handleStatus(interaction, event) {
    const { emoji } = getEventTheme(event.event_key);
    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(event.status === 'completed' ? Colors.SUCCESS : Colors.PRIMARY)
            .setTitle(`${emoji} ${event.title}`)
            // progressBar() already appends the percentage
            .setDescription(`${event.description}\n\n${progressBar(event.progress_minutes, event.target_minutes, 16)}`)
            .addFields({
                name: 'Global focus minutes',
                value: `**${event.progress_minutes.toLocaleString('en-US')} / ${event.target_minutes.toLocaleString('en-US')}**`,
                inline: true,
            }, {
                name: 'Status',
                value: event.status === 'completed' ? '✅ Goal reached' : '🟢 Active',
                inline: true,
            })
            .setFooter({ text: 'Every completed focus session in any server moves the event forward.' })
            .setTimestamp()],
    });
}

async function handleClues(interaction, event) {
    const clues = getGlobalEventClues(event.id);
    const description = clues.length
        ? clues.map((clue, index) => `**${index + 1}. ${clue.clue_key}**\n${clue.clue_text}`).join('\n\n')
        : 'Nothing unlocked yet. Keep focusing!';
    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`🧩 ${event.title}: milestones`)
            .setDescription(description)
            .setFooter({ text: 'Keep focusing to unlock the next milestone.' })
            .setTimestamp()],
    });
}

// Started from the owner-only /ownertools command
module.exports.handleStart = handleStart;
