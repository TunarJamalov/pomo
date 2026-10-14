const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
    getGuildAnalytics,
    getActivationAnalytics,
    getOnboardingAnalytics,
    getSetupFunnelAnalytics,
    getTopCommands,
    getChurnAnalytics,
    getRetentionAnalytics,
    db,
} = require('../utils/database');
const { Colors } = require('../utils/constants');
const { errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    ownerOnly: true,
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('botstats')
        .setDescription('View private PomoBot growth statistics (Owner only)'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);

        if (interaction.user.id !== process.env.OWNER_ID) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'unauthorizedTitle'), t(language, 'ownerOnlyCommandBody'))],
                flags: 64,
            });
        }

        const analytics = getGuildAnalytics();
        const activation = getActivationAnalytics();
        const onboarding = getOnboardingAnalytics(7, 5);
        const setupFunnel = getSetupFunnelAnalytics();
        const topCommands = getTopCommands(7, 5);
        const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
        const activeUsers = db.prepare(`
            SELECT COUNT(DISTINCT user_id) as count
            FROM (
                SELECT user_id FROM study_sessions WHERE started_at >= datetime('now', '-7 days')
                UNION
                SELECT user_id FROM voice_sessions WHERE started_at >= datetime('now', '-7 days')
                UNION
                SELECT tm.user_id
                FROM team_members tm
                JOIN team_sessions ts ON tm.session_id = ts.id
                WHERE ts.started_at >= datetime('now', '-7 days')
            )
        `).get().count;
        const setupRate = analytics.active_guilds
            ? Math.round(((activation.configured_guilds || 0) / analytics.active_guilds) * 100)
            : 0;
        const completeRate = analytics.active_guilds
            ? Math.round(((setupFunnel.setup_complete || 0) / analytics.active_guilds) * 100)
            : 0;
        const topCommandsText = topCommands.length
            ? topCommands.map((row, index) =>
                `${index + 1}. \`/${row.command_name}${row.subcommand_name ? ` ${row.subcommand_name}` : ''}\` - ${row.uses}`
            ).join('\n')
            : 'Collecting data from this deployment onward.';
        const onboardingTopicsText = onboarding.top_topics?.length
            ? onboarding.top_topics.map((row, index) =>
                `${index + 1}. ${formatPanelTopic(row.topic)} - ${row.clicks}`
            ).join('\n')
            : 'No panel clicks yet.';

        const { db: statsDb } = require('../utils/database');
        const pro = statsDb.prepare(`
            SELECT
                (SELECT COUNT(*) FROM premium_entitlements WHERE status = 'active' AND (expires_at IS NULL OR expires_at > datetime('now'))) AS active,
                (SELECT COUNT(*) FROM premium_entitlements WHERE status = 'active' AND source = 'paddle' AND expires_at > datetime('now')) AS paid,
                (SELECT COUNT(*) FROM billing_events WHERE processed_at IS NULL) AS queued,
                (SELECT MAX(received_at) FROM billing_events) AS last_event
        `).get();

        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle('PomoBot Growth Stats')
            .addFields(
                { name: 'Active Servers', value: `${analytics.active_guilds || 0}`, inline: true },
                { name: 'Reachable Members', value: `${analytics.reachable_members || 0}`, inline: true },
                { name: 'Lifetime Servers', value: `${analytics.lifetime_guilds || 0}`, inline: true },
                { name: 'Joins (7d)', value: `${analytics.joins_7d || 0}`, inline: true },
                { name: 'Leaves (7d)', value: `${analytics.leaves_7d || 0}`, inline: true },
                { name: 'Net Growth (7d)', value: `${(analytics.joins_7d || 0) - (analytics.leaves_7d || 0)}`, inline: true },
                { name: 'Registered Users', value: `${users}`, inline: true },
                                { name: 'Active Users (7d)', value: `${activeUsers}`, inline: true },
                { name: '💰 Pomo Pro', value: `Active: ${pro.active} (paid via Paddle: ${pro.paid})\nPayment events waiting: ${pro.queued}${pro.last_event ? ` · last ${pro.last_event} UTC` : ''}`, inline: false },
                { name: 'Configured Servers', value: `${activation.configured_guilds || 0} (${setupRate}%)`, inline: true },
                { name: 'Setup Funnel', value: `None ${setupFunnel.setup_none || 0} / Partial ${setupFunnel.setup_partial || 0} / Complete ${setupFunnel.setup_complete || 0} (${completeRate}%)`, inline: false },
                { name: 'Focus Servers (7d)', value: `${activation.focus_guilds_7d || 0}`, inline: true },
                { name: 'Command Servers (7d)', value: `${activation.command_guilds_7d || 0}`, inline: true },
                { name: 'Voice / Reports / Goals', value: `${activation.voice_guilds || 0} / ${activation.report_guilds || 0} / ${activation.goal_guilds || 0}`, inline: false },
                { name: 'Setup Nudges / Conversions', value: `${activation.setup_nudges_sent || 0} / ${activation.setup_nudge_conversions || 0}`, inline: true },
                { name: 'Day-1 Follow-ups / Conversions', value: `${activation.setup_followups_sent || 0} / ${activation.setup_followup_conversions || 0}`, inline: true },
                { name: 'Guide Panels / Clicks (7d)', value: `${onboarding.panels_posted || 0} / ${onboarding.panel_clicks || 0}`, inline: true },
                { name: 'Panel Reach (7d)', value: `${onboarding.guilds || 0} servers / ${onboarding.users || 0} users`, inline: true },
                { name: 'Top Panel Clicks', value: onboardingTopicsText, inline: false },
                { name: `Top Commands (${activation.commands_7d || 0} uses)`, value: topCommandsText, inline: false },
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed, buildChurnRetentionEmbed()], flags: 64 });
    },
};

function pct(part, total) {
    return total ? `${Math.round(((part || 0) / total) * 100)}%` : '—';
}

function buildChurnRetentionEmbed() {
    const churn = getChurnAnalytics(30);
    const r = getRetentionAnalytics();
    const n = churn.total || 0;

    const leftText = n
        ? `**${n}** servers left\n`
            + `<1h: **${churn.within_1h || 0}** · <1d: **${churn.within_1d || 0}** · `
            + `<7d: **${churn.within_7d || 0}** · 7d+: **${churn.after_7d || 0}**`
        : 'No tracked leaves in this window.';
    const beforeText = n
        ? `Never used a command: **${pct(churn.never_used, n)}**\n`
            + `No setup at all: **${pct(churn.no_setup, n)}**\n`
            + `Got a setup nudge: **${pct(churn.nudged, n)}**\n`
            + `Under 20 members: **${pct(churn.small_servers, n)}** (avg ${churn.avg_members || 0})`
        : '—';
    const cohortText = churn.joined
        ? `${churn.already_left || 0} of ${churn.joined} servers that joined already left (**${pct(churn.already_left, churn.joined)}**)`
        : 'No new joins in this window.';
    const retentionLine = (label, returned, cohort) =>
        `${label}: **${pct(returned, cohort)}** (${returned || 0}/${cohort || 0})`;

    return new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle('Churn & Retention')
        .addFields(
            { name: 'Server leaves (30d)', value: leftText, inline: false },
            { name: 'Before leaving', value: beforeText, inline: false },
            { name: 'Joined in 30d', value: cohortText, inline: false },
            {
                name: 'User retention (joined in last 90d)',
                value: [
                    retentionLine('Came back after 1 day', r.d1_returned, r.d1_cohort),
                    retentionLine('Came back after 7 days', r.d7_returned, r.d7_cohort),
                    retentionLine('Came back after 30 days', r.d30_returned, r.d30_cohort),
                    `New users (30d): **${r.new_users_30d || 0}**`,
                ].join('\n'),
                inline: false,
            },
        )
        .setFooter({ text: 'Leaves exclude servers that were present before tracking began. Retention = any command or completed session.' })
        .setTimestamp();
}

function formatPanelTopic(topic) {
    const labels = {
        quickstart: 'Quick Start',
        solo: 'Solo Study',
        voice: 'Voice Tracking',
        garden: 'Garden Rewards',
        server: 'Server Setup',
        activity: 'Activity',
    };
    return labels[topic] || topic || 'Unknown';
}
