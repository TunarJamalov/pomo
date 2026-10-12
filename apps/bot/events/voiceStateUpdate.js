const { Events } = require('discord.js');
const { handleVoiceStateUpdate } = require('../utils/voiceManager');

module.exports = {
    name: Events.VoiceStateUpdate,
    once: false,
    async execute(oldState, newState) {
        try {
            await handleVoiceStateUpdate(oldState, newState);
        } catch (err) {
            const userId = newState.member?.id || oldState.member?.id || 'unknown';
            console.error(`[VOICE] State update failed for ${userId}:`, err);
        }
    },
};
