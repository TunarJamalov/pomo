/**
 * Optional chime in voice when a pomodoro phase ends (/pomodoro sound, /team sound).
 * Discord notifications are easy to miss on mobile; a sound in the call isn't.
 */
const path = require('path');
const { PermissionFlagsBits } = require('discord.js');

const CHIME_FILE = path.join(__dirname, '..', 'assets', 'sounds', 'chime.mp3');

/** The voice channel to ring: the first of these users (host first) who is in voice where Pomo can speak. */
function findChimeChannel(guild, userIds) {
    const me = guild.members?.me;
    if (!me) return null;
    for (const userId of userIds) {
        const channel = guild.voiceStates?.cache?.get(userId)?.channel;
        if (!channel) continue;
        const permissions = channel.permissionsFor(me);
        if (permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
            return channel;
        }
    }
    return null;
}

/** Rings in the background: never delays or breaks the timer. */
function ringPhaseChime(client, guildId, userIds) {
    if (!guildId) return false;
    const guild = client?.guilds?.cache?.get(guildId);
    if (!guild) return false;
    const channel = findChimeChannel(guild, userIds);
    if (!channel) return false;
    require('./audioPlayer').playChime(guild, channel.id, CHIME_FILE).catch(() => {});
    return true;
}

module.exports = { CHIME_FILE, findChimeChannel, ringPhaseChime };
