/**
 * /help - Categorized command reference with a polished embed.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Colors, SUPPORT_SERVER_URL } = require('../utils/constants');
const { getOrCreateGuildSettings } = require('../utils/database');
const { normalizeLanguage, t } = require('../utils/i18n');

const categories = {
    study: {
        emoji: '\uD83D\uDCDA',
        title: 'Study',
        titleKey: 'helpCategoryStudy',
        commands: [
            { name: '/study [minutes] [title]', desc: '**Single focus timer.** Set a duration (5-100 min) and study. Simple, no cycles. Best for casual sessions.' },
            { name: '/pomodoro [work] [break] [cycles]', desc: '**Automatic work/break cycles.** Bot switches between focus and break automatically. Max 25 min work, 4 cycles. Best for structured studying.' },
            { name: '/break [minutes]', desc: '**Standalone break timer.** No rewards - just a countdown. Use after /study or whenever you need a rest.' },
            { name: '/team [minutes] [limit] [break] [cycles]', desc: '**Group session.** Host a room, friends join and study together. Supports both simple and Pomodoro modes.' },
            { name: '/voice stats [user]', desc: '**Automatic voice focus stats.** See tracked study time, credited rewards, and completed voice sessions.' },
            { name: '/voice leaderboard [period]', desc: '**Voice focus ranking.** Compare tracked voice study time on this server.' },
            { name: '/voice active', desc: 'See members whose focus time is currently being tracked in voice.' },
            { name: '/goal status', desc: 'View the server\'s recurring weekly focus goal and your contribution.' },
            { name: '/goal leaderboard', desc: 'View this week\'s top server goal contributors.' },
            { name: '/goal claim', desc: 'Claim the reward after the server completes its weekly goal.' },
            { name: '/todo [add/list/done/delete]', desc: '**Personal task list.** Add what you need to do. Complete tasks to earn water.' },
            { name: '/exam [add/list/delete]', desc: '**Track exam countdowns.** Add an exam date to see countdown and daily study target.' },
            { name: '/habit [add/check/view/log/remove/timezone]', desc: '**Habit tracker.** Track daily habits, tick them off with one tap and see your grid of days and streaks. 5 habits free, 15 with Pomo Pro.' },
            { name: '/cancel', desc: 'Cancel your current active session.' },
            { name: '/pause', desc: 'Pause your running solo study session.' },
            { name: '/resume', desc: 'Resume a paused solo study session.' },
            { name: '/plan [create/list/cancel/export]', desc: '**Schedule a group session.** Members sign up and get reminded; export to your calendar.' },
        ],
    },
    clans: {
        emoji: '\u2694\uFE0F',
        title: 'Clans',
        titleKey: 'helpCategoryClans',
        commands: [
            { name: '/clan create [name]', desc: '**Found a clan.** Costs 1,000 water and requires Level 5. Clan name must be 3-20 characters and globally unique.' },
            { name: '/clan invite [@user]', desc: '**Invite a friend.** Send a DM invitation to a user. They must accept with /clan join. Owner only.' },
            { name: '/clan join [name]', desc: '**Join a clan.** Enter the exact clan name after receiving an invite. You can only be in one clan at a time.' },
            { name: '/clan leave', desc: '**Leave your clan.** Owners must transfer ownership or dissolve first.' },
            { name: '/clan transfer [@user]', desc: '**Transfer ownership.** Owner only; target must already be a clan member.' },
            { name: '/clan dissolve [confirm]', desc: '**Delete your clan.** Owner only; type the exact clan name to confirm.' },
            { name: '/clan info', desc: '**View clan stats.** See your clan name, level, XP, total focus time, and member list.' },
            { name: '/clan leaderboard', desc: '**Global clan rankings.** Top 10 clans worldwide sorted by Clan XP.' },
        ],
    },
    garden: {
        emoji: '\uD83C\uDF31',
        title: 'Garden',
        titleKey: 'helpCategoryGarden',
        commands: [
            { name: '/garden', desc: 'View & manage your garden. Plant seeds, water your plants, and harvest crops.' },
            { name: '/snack', desc: 'Craft snacks from your harvest and eat them for temporary Water or XP buffs.' },
        ],
    },
    social: {
        emoji: '\uD83D\uDC65',
        title: 'Social',
        titleKey: 'helpCategorySocial',
        commands: [
            { name: '/profile [user]', desc: 'View your profile card or another user\'s. Shows XP, level, streak, water, and pets.' },
            { name: '/friend [add/accept/remove/list]', desc: 'Manage your study friends. Friends get notified when you start/end a session.' },
            { name: '/achievements [user]', desc: 'View unlocked and locked achievements with progress.' },
            { name: '/titles [view/equip/clear]', desc: 'Show off a title you unlocked on your profile.' },
            { name: '/persona [view/choose]', desc: 'Pick a study persona for a passive bonus (unlocks at Level 5).' },
            { name: '/referral [info/use]', desc: 'Invite friends and earn rewards when they start studying.' },
            { name: '/stats [view] [period]', desc: 'View basic stats or Pomo Pro analytics for the last 7, 30, or 90 days with a focus heatmap.' },
            { name: '/recap', desc: 'Generate a shareable image recap of your last 7 focus days.' },
            { name: '/mygoal [setup/status/disable]', desc: 'Create and track a recurring weekly or monthly personal focus goal. Pomo Pro.' },
            { name: '/dataexport [period]', desc: 'Privately export your completed solo, team, and voice focus history as CSV. Pomo Pro.' },
            { name: '/proprofile [view/accent/badge/reset]', desc: 'Customize your profile accent and badge style. Pomo Pro.' },
            { name: '/streak [status/recover/repair]', desc: 'View, restore, or repair a broken streak. Repair costs 50 Water (no Pro required).' },
            { name: '/premium [status/perks]', desc: 'Get Pomo Pro ($2.99/month or $19.99/year), see your status and manage your subscription.' },
            { name: '/leaderboard', desc: 'Server or global rankings by focus time: this week, today, season or all-time. Server weekly counts /study, /team and voice. Includes a Top Clans tab.' },
            { name: '/send [@user] [amount] [reason]', desc: '**Send water to a friend.** Requires owner approval. Level 3+ required. Max 2,000 per transfer.' },
        ],
    },
    market: {
        emoji: '\uD83C\uDFEA',
        title: 'Market & Economy',
        titleKey: 'helpCategoryMarket',
        commands: [
            { name: '/market', desc: 'Spend water on boosts, items, seeds, and profile themes.' },
            { name: '/daily', desc: 'Claim your daily +3 water. Resets every 24 hours.' },
            { name: '/quests [daily/claim]', desc: 'View today\'s daily quests and claim water + XP rewards.' },
            { name: '/vote', desc: 'Vote on Top.gg for bonus water rewards.' },
            { name: '/pet inventory', desc: 'View all your pets, their levels, and active buffs.' },
            { name: '/pet equip [pet]', desc: 'Equip a pet to earn XP or Water bonuses on every session.' },
            { name: '/pet feed [item] [amount]', desc: 'Feed harvested crops to your active pet for extra Pet XP.' },
            { name: '/season [current/leaderboard/rewards/history]', desc: 'Season rankings, reward tiers, and your results from past seasons.' },
        ],
    },
    settings: {
        emoji: '\u2699\uFE0F',
        title: 'Settings & Utility',
        titleKey: 'helpCategorySettings',
        commands: [
            { name: '/setup start', desc: 'Configure voice tracking and weekly reports in one step. Manage Server permission required.' },
            { name: '/setup status', desc: 'View the current server configuration.' },
            { name: '/setup reset', desc: 'Disable server voice tracking and weekly reports.' },
            { name: '/goal setup', desc: 'Enable a recurring weekly server focus challenge. Manage Server permission required.' },
            { name: '/goal disable', desc: 'Disable recurring weekly server goals.' },
            { name: '/settings view', desc: 'View and toggle all notification settings with interactive buttons.' },
            { name: '/settings notifications [on/off]', desc: 'Toggle 5-minute end reminders for your sessions.' },
            { name: '/settings reminders [dm/mention]', desc: 'Choose whether reminders come as a DM or a channel mention.' },
            { name: '/settings friend_notify [on/off]', desc: 'Let friends know when you start or finish a study session.' },
            { name: '/settings session_card', desc: 'Choose the image card or the classic text summary after a session.' },
            { name: '/report [setup/disable/preview]', desc: 'Server admins: weekly study report in a channel of your choice.' },
            { name: '/lofi [play/stop]', desc: '24/7 lofi radio in your voice channel. Pomo Pro.' },
            { name: '/language [view/set/list]', desc: 'View or change this server language. Translations are being expanded gradually.' },
            { name: '/voice setup [target]', desc: 'Configure automatic voice focus tracking for a voice channel or category. Manage Server permission required.' },
            { name: '/voice settings', desc: 'View this server\'s voice tracking rules, reward cap, and selected target.' },
            { name: '/voice disable', desc: 'Disable automatic voice focus tracking on this server. Manage Server permission required.' },
            { name: '/studyroom setup [category]', desc: 'Set the category where temporary study rooms are created. Admin only.' },
            { name: '/studyroom trigger [channel]', desc: 'Set a join-to-create trigger channel. Users joining auto-create a private voice room. Admin only.' },
            { name: '/findbuddy [subject] [duration] [mode]', desc: 'Find an accountability study partner. Bot matches you with a compatible user in your server.' },
            { name: '/unmatch', desc: 'End your current PomoMatch partnership.' },
            { name: '/challenge [create/list/join/leaderboard]', desc: 'Create and join community study challenges (time, streak, sessions, goals).' },
            { name: '/health', desc: 'View server health dashboard with engagement metrics and actionable recommendations.' },
            { name: '/serverstats', desc: 'View server activity, focus trends, setup status, and top contributors. Manage Server permission required.' },
            { name: '/server feature', desc: 'List your server in the Pomo study server directory. Remove it any time with /server unfeature. Manage Server permission required.' },
            { name: '/ambient', desc: 'Get a link to ambient study sounds (rain, cafe, forest, ocean, lo-fi).' },
            { name: '/guide [topic] [share] [panel]', desc: 'Show a simple guide. Server managers can share a guide or post an interactive onboarding panel.' },
            { name: '/feedback [type] [message]', desc: 'Send a bug report, suggestion, or question directly to the PomoBot team.' },
            { name: '/invite', desc: 'Get the invite link, setup guide, and support server link for sharing PomoBot.' },
            { name: '/help', desc: 'Show this help menu.' },
            { name: '/credits', desc: 'Meet the team behind PomoBot.' },
        ],
    },
    owner: {
        emoji: '\uD83D\uDC51',
        title: 'Owner Only',
        titleKey: 'helpCategoryOwner',
        commands: [
            { name: '/botstats', desc: 'View private server growth and weekly active-user analytics. Owner only.' },
            { name: '/ownercontacts [status] [limit]', desc: 'Export current server owner IDs and activation signals as CSV. Owner only.' },
            { name: '/give [user] [amount]', desc: 'Give water to any user directly. Owner only.' },
            { name: '/premiumadmin [grant/revoke/list/inspect]', desc: 'Manage or inspect Pomo Pro access. Owner only.' },
            { name: '/announce [title] [message] [features] [giveaway] [confirm]', desc: 'Preview or send a structured DM announcement with sections and a link button. Owner only.' },
        ],
    },
};

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View all bot commands'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const embed = buildOverviewEmbed(language);

        const row = buildCategoryRow(null, language);

        await interaction.reply({ embeds: [embed], components: [row, buildLinksRow(language)] });
    },
};

// Owner commands only exist in the owner's server, so /help doesn't list them
const publicCategories = () => Object.entries(categories).filter(([key]) => key !== 'owner');

function buildOverviewEmbed(language = 'en') {
    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`\uD83E\uDD16 ${t(language, 'helpTitle')}`)
        .setDescription(t(language, 'helpDescription'));

    for (const [, cat] of publicCategories()) {
        const cmds = cat.commands.map(c => `\`${c.name}\``).join(', ');
        embed.addFields({ name: `${cat.emoji} ${getCategoryTitle(cat, language)}`, value: cmds, inline: false });
    }

    embed.setFooter({ text: t(language, 'helpFooter') });
    embed.setTimestamp();

    return embed;
}

function buildCategoryEmbed(key, language = 'en') {
    const cat = key === 'owner' ? null : categories[key];
    if (!cat) return buildOverviewEmbed(language);

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`${cat.emoji} ${t(language, 'helpCategoryCommands', { category: getCategoryTitle(cat, language) })}`);

    let desc = '';
    for (const cmd of cat.commands) {
        desc += `**${cmd.name}**\n${cmd.desc}\n\n`;
    }
    embed.setDescription(desc);
    embed.setFooter({ text: t(language, 'helpCategoryFooter') });
    embed.setTimestamp();

    return embed;
}

async function handleHelpCategory(interaction) {
    const key = interaction.values[0];
    const language = getInteractionLanguage(interaction);
    const embed = buildCategoryEmbed(key, language);

    const row = buildCategoryRow(key, language);

    await interaction.update({ embeds: [embed], components: [row, buildLinksRow(language)] });
}

/** Website, support server and the open-source code. */
function buildLinksRow(language = 'en') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('pomofocus.online').setEmoji('🌐').setURL('https://pomofocus.online'),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'feedbackSupportButton')).setURL(SUPPORT_SERVER_URL),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('GitHub').setEmoji('⭐').setURL('https://github.com/TunarJamalov/pomo'),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('TikTok').setEmoji('🎬').setURL('https://www.tiktok.com/@pomo.study'),
    );
}

function buildCategoryRow(selectedKey = null, language = 'en') {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_category')
            .setPlaceholder(t(language, 'helpSelectPlaceholder'))
            .addOptions(
                publicCategories().map(([k, cat]) => ({
                    label: getCategoryTitle(cat, language),
                    value: k,
                    emoji: cat.emoji,
                    description: t(language, 'helpCommandCount', { count: cat.commands.length }),
                    default: k === selectedKey,
                }))
            )
    );
}

function getInteractionLanguage(interaction) {
    if (!interaction.guildId || interaction.guild === null) {
        return normalizeLanguage(interaction.locale || 'en');
    }

    const settings = getOrCreateGuildSettings(interaction.guildId);
    return normalizeLanguage(settings.language || interaction.guildLocale || interaction.locale || 'en');
}

function getCategoryTitle(category, language) {
    return t(language, category.titleKey) || category.title;
}

module.exports.handleHelpCategory = handleHelpCategory;
module.exports.buildCategoryRow = buildCategoryRow;
module.exports.buildLinksRow = buildLinksRow;
