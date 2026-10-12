/**
 * Helpers for commands run through a user install: in a server the bot is not
 * a member of, or in a group DM. There the bot can answer the interaction but
 * cannot post or edit channel messages later, so live timers move to the
 * user's DMs and nothing is attributed to that server.
 */
const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationIntegrationType, InteractionContextType,
} = require('discord.js');
const { t } = require('./i18n');

// Personal commands that work without the bot in the server. Anything that
// needs server data or posts to channels later stays server-install only.
const USER_INSTALL_COMMANDS = new Set([
    'study', 'pomodoro', 'pause', 'resume', 'cancel',
    'profile', 'stats', 'streak', 'daily', 'quests', 'achievements', 'titles', 'recap',
    'pet', 'garden', 'market', 'snack',
    'todo', 'mygoal', 'exam', 'habit',
    'help', 'vote', 'invite',
]);

/** Marks a command's JSON as usable from a user install (servers, bot DM, group DMs). */
function applyInstallContexts(json) {
    if (!USER_INSTALL_COMMANDS.has(json.name)) return json;
    return {
        ...json,
        integration_types: [ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall],
        contexts: [InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel],
    };
}

/** True when the command came from a server the bot has not joined. */
function isForeignGuild(interaction) {
    return Boolean(interaction?.guildId) && interaction.guild === null;
}

/** True when the bot cannot post or edit messages in this channel later. */
function needsDmTimer(interaction) {
    return isForeignGuild(interaction) || interaction?.context === InteractionContextType.PrivateChannel;
}

/** Server id to attribute activity to, or null outside servers the bot is in. */
function botGuildId(interaction) {
    return interaction?.guildId && !isForeignGuild(interaction) ? interaction.guildId : null;
}

/** Opens the user's DM channel for a live timer, or null when DMs are closed. */
async function openTimerDm(interaction) {
    return interaction.user.createDM().catch(() => null);
}

/**
 * Public answer in the original channel once the timer is running in DMs.
 * It doubles as a small invite for everyone else in that chat.
 */
function buildDmTimerNotice(interaction, language, minutes, timerMessage) {
    const components = [];
    const buttons = [];
    if (timerMessage?.url) {
        buttons.push(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(timerMessage.url).setLabel(t(language, 'dmTimerOpenButton')));
    }
    const clientId = interaction.client?.application?.id || interaction.client?.user?.id || process.env.CLIENT_ID;
    if (clientId) {
        const { getUserInstallUrl } = require('./invite');
        buttons.push(new ButtonBuilder()
            .setStyle(ButtonStyle.Link)
            .setURL(getUserInstallUrl(clientId))
            .setLabel(t(language, 'dmTimerAddButton')));
    }
    if (buttons.length) components.push(new ActionRowBuilder().addComponents(...buttons));
    return {
        content: t(language, 'dmTimerStartedNotice', { user: `<@${interaction.user.id}>`, minutes }),
        components,
        allowedMentions: { parse: [] },
    };
}

/** Answers the deferred interaction with the DM notice; never throws. */
async function postDmTimerNotice(interaction, language, minutes, timerMessage) {
    try {
        await interaction.editReply(buildDmTimerNotice(interaction, language, minutes, timerMessage));
    } catch (err) {
        console.warn('[TIMER] Could not post DM timer notice:', err.message);
        await interaction.editReply({ content: t(language, 'dmTimerStartedNotice', { user: `<@${interaction.user.id}>`, minutes }) }).catch(() => {});
    }
}

module.exports = {
    USER_INSTALL_COMMANDS,
    applyInstallContexts,
    isForeignGuild,
    needsDmTimer,
    botGuildId,
    openTimerDm,
    buildDmTimerNotice,
    postDmTimerNotice,
};
