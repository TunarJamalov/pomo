const {
    Events,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const { recordGuildJoin } = require('../utils/database');
const { Colors } = require('../utils/constants');
const { buildSetupButtonRow } = require('../utils/setupWizard');
const { normalizeLanguage, t } = require('../utils/i18n');

module.exports = {
    name: Events.GuildCreate,
    once: false,
    async execute(guild) {
        recordGuildJoin(guild);
        const language = normalizeLanguage(guild.preferredLocale || 'en');

        let owner;
        try {
            owner = await guild.fetchOwner();
        } catch (err) {
            // Ignore error if owner cannot be fetched
        }

        // Post in the server so whoever added Pomo sees the next step right away,
        // and DM the owner in case they did not add it themselves.
        const channel = findWelcomeChannel(guild);
        if (channel) {
            try {
                const message = await channel.send({
                    embeds: [buildWelcomeEmbed(guild, language)],
                    components: [buildSetupButtonRow(null, language)],
                });
                if (channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
                    await message.pin().catch(() => {});
                }
            } catch (err) {
                console.log(`[GUILD_CREATE] Could not send or pin message in ${guild.name}`);
            }
        }

        if (owner) {
            await owner.send({
                embeds: [buildWelcomeEmbed(guild, language)],
                components: [buildSetupButtonRow(guild.id, language)],
            }).catch(() => console.log(`[GUILD_CREATE] Could not DM owner of ${guild.name}`));
        }

        await logGuildChange(guild.client, guild, true);
    },
};

function buildWelcomeEmbed(guild, language) {
    return new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'welcomeTitle', { server: guild.name }))
        .setDescription(t(language, 'welcomeIntro'))
        .addFields(
            { name: t(language, 'welcomeTryName'), value: t(language, 'welcomeTryValue'), inline: false },
            { name: t(language, 'welcomeQuickName'), value: t(language, 'welcomeQuickValue'), inline: false },
            { name: t(language, 'welcomeFullName'), value: t(language, 'welcomeFullValue'), inline: false },
        )
        .setFooter({ text: t(language, 'welcomeFooter') })
        .setTimestamp();
}

function findWelcomeChannel(guild) {
    const candidates = [guild.systemChannel, ...guild.channels.cache.values()];
    return candidates.find(channel => {
        if (!channel?.isTextBased() || channel.isDMBased()) return false;
        const permissions = channel.permissionsFor(guild.members.me);
        return permissions?.has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
        ]);
    }) || null;
}

async function logGuildChange(client, guild, joined) {
    const channelId = process.env.GUILD_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
    if (!channelId) return;
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor(joined ? Colors.SUCCESS : Colors.ERROR)
        .setTitle(joined ? 'Server Joined' : 'Server Left')
        .setDescription(`**${guild.name}**\nID: \`${guild.id}\`\nMembers: **${guild.memberCount || 0}**`)
        .setTimestamp();
    await channel.send({ embeds: [embed] }).catch(() => {});
}

module.exports.findWelcomeChannel = findWelcomeChannel;
module.exports.buildWelcomeEmbed = buildWelcomeEmbed;
module.exports.logGuildChange = logGuildChange;
