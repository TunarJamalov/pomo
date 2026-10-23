const {
    Events,
    EmbedBuilder,
    PermissionFlagsBits,
} = require('discord.js');
const { recordGuildJoin, recordOnboardingEvent } = require('../utils/database');
const { Colors } = require('../utils/constants');
const { buildSetupButtonRow, canAutoSetup } = require('../utils/setupWizard');
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
        // What the new server actually saw, for /botstats (onboarding_events, event "welcome")
        const track = topic => recordOnboardingEvent(guild.id, guild.ownerId || 'unknown', 'welcome', topic);

        const channel = findWelcomeChannel(guild);
        if (channel) {
            try {
                const message = await channel.send({
                    embeds: [buildWelcomeEmbed(guild, language)],
                    components: [buildSetupButtonRow(null, language, guild)],
                });
                track('posted');
                if (channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ManageMessages)) {
                    await message.pin().catch(() => {});
                }
            } catch (err) {
                track('post_failed');
                console.log(`[GUILD_CREATE] Could not send or pin message in ${guild.name}`);
            }
        } else {
            track('no_channel');
        }

        if (owner) {
            const sent = await owner.send({
                embeds: [buildWelcomeEmbed(guild, language)],
                components: [buildSetupButtonRow(guild.id, language, guild)],
            }).then(() => true).catch(() => {
                console.log(`[GUILD_CREATE] Could not DM owner of ${guild.name}`);
                return false;
            });
            track(sent ? 'dm_sent' : 'dm_failed');
        }

        await logGuildChange(guild.client, guild, true);
    },
};

function buildWelcomeEmbed(guild, language) {
    // Quick Setup first: servers with voice tracking keep about twice as many members studying
    const fields = [
        { name: t(language, 'welcomeQuickName'), value: t(language, 'welcomeQuickValue'), inline: false },
        { name: t(language, 'welcomeTryName'), value: t(language, 'welcomeTryValue'), inline: false },
    ];
    // Only offered where Pomo can create channels and roles; otherwise the button just fails
    if (canAutoSetup(guild)) {
        fields.push({ name: t(language, 'welcomeFullName'), value: t(language, 'welcomeFullValue'), inline: false });
    }
    return new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(t(language, 'welcomeTitle', { server: guild.name }))
        .setDescription(t(language, 'welcomeIntro'))
        .addFields(...fields)
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
