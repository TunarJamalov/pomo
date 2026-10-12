const { Events } = require('discord.js');
const { recordGuildLeave } = require('../utils/database');
const { logGuildChange } = require('./guildCreate');

module.exports = {
    name: Events.GuildDelete,
    once: false,
    async execute(guild) {
        recordGuildLeave(guild);
        await logGuildChange(guild.client, guild, false);
    },
};
