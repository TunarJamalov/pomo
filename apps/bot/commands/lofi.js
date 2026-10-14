const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { Colors } = require('../utils/constants');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { playLofi, stopLofi, isPlayingLofi, isAudioAvailable } = require('../utils/audioPlayer');
const { isFullPro } = require('../utils/premiumManager');

// 24/7 lofi is Pro only (not in Plus)
function checkPremium(userId) {
    return isFullPro(userId);
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('lofi')
        .setDescription('Play 24/7 Lofi Radio in your voice channel (Pomo Pro)')
        .addSubcommand(sub => sub
            .setName('play')
            .setDescription('Start playing lofi radio in your current voice channel'))
        .addSubcommand(sub => sub
            .setName('stop')
            .setDescription('Stop the radio and make the bot leave')),

    async execute(interaction) {
        if (!isAudioAvailable()) {
            return interaction.reply({
                embeds: [errorEmbed('Audio Disabled', 'The audio module is not installed on this server. Contact the developer.')],
                flags: 64
            });
        }

        const isPro = checkPremium(interaction.user.id);
        if (!isPro) {
            return interaction.reply({
                embeds: [errorEmbed('⭐ Pomo Pro Required', 'Playing 24/7 Lofi Radio is a Pomo Pro feature! Check out `/premium` to unlock it.')],
                flags: 64
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const voiceChannel = interaction.member.voice.channel;

        if (subcommand === 'play') {
            if (!voiceChannel) {
                return interaction.reply({
                    embeds: [errorEmbed('Join a Channel', 'You need to be in a voice channel to start the radio.')],
                    flags: 64
                });
            }

            // Acknowledge quickly because join takes a bit
            await interaction.deferReply();

            const result = await playLofi(interaction.guild, voiceChannel.id);
            if (result.success) {
                await interaction.editReply({
                    embeds: [successEmbed('🎵 Lofi Radio Started', `PomoBot has joined <#${voiceChannel.id}> and is playing 24/7 Lofi beats to help you focus.`)]
                });
            } else if (result.reason === 'no_opus') {
                await interaction.editReply({
                    embeds: [errorEmbed('Audio Setup Required', 'The audio module is missing a required encoder. Please contact the bot developer.')]
                });
            } else {
                await interaction.editReply({
                    embeds: [errorEmbed('Playback Failed', 'Could not start the radio. Ensure I have permission to join and speak in that channel.')]
                });
            }
        }

        if (subcommand === 'stop') {
            if (!isPlayingLofi(interaction.guildId)) {
                return interaction.reply({
                    embeds: [errorEmbed('Not Playing', 'I am not currently playing music in any channel.')],
                    flags: 64
                });
            }

            stopLofi(interaction.guildId);
            return interaction.reply({
                embeds: [successEmbed('🔇 Radio Stopped', 'Lofi radio has been stopped and I have left the channel.')]
            });
        }
    }
};
