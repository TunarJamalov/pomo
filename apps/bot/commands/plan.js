/**
 * /plan - Schedule a group study session in advance.
 */

const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
} = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const {
    getOrCreateUser,
    createStudyPlan,
    getStudyPlan,
    updatePlanMessageId,
    updatePlanStatus,
    getPlanSignups,
    signupForPlan,
    leaveFromPlan,
    getActivePlans,
    getHostPlan,
    db,
} = require('../utils/database');
const { generateIcs } = require('../utils/calendarExport');
const { createLobbyFromPlan } = require('./team');
const { getInteractionLanguage, getGuildLanguage, t } = require('../utils/i18n');

const planTimers = new Map();

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('plan')
        .setDescription('Schedule a group study session in advance')
        .addSubcommand(sub =>
            sub.setName('create')
                .setDescription('Schedule a new group study session')
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Session title (e.g. "Math Exam Prep")')
                        .setRequired(true)
                        .setMaxLength(80))
                .addStringOption(opt =>
                    opt.setName('time')
                        .setDescription('When to start - e.g. "in 2h", "in 30m", "in 1h30m"')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('duration')
                        .setDescription('Study duration in minutes (5-100)')
                        .setRequired(true)
                        .setMinValue(5)
                        .setMaxValue(100))
                .addIntegerOption(opt =>
                    opt.setName('break')
                        .setDescription('Break duration in minutes for Pomodoro mode (leave empty for plain study)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(30))
                .addIntegerOption(opt =>
                    opt.setName('cycles')
                        .setDescription('Pomodoro cycles (default: 4, max: 4)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(4))
                .addIntegerOption(opt =>
                    opt.setName('limit')
                        .setDescription('Max participants (default: 10, max: 20)')
                        .setRequired(false)
                        .setMinValue(2)
                        .setMaxValue(20)))
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View upcoming scheduled study sessions in this server'))
        .addSubcommand(sub =>
            sub.setName('cancel')
                .setDescription('Cancel your currently scheduled study session'))
        .addSubcommand(sub =>
            sub.setName('export')
                .setDescription('Export your scheduled plans as an iCal (.ics) file')),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        getOrCreateUser(userId);

        if (!interaction.guildId) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'serverOnlyTitle'), t(language, 'planServerOnlyBody'))],
                flags: 64,
            });
        }

        if (sub === 'create') return handleCreate(interaction, userId, language);
        if (sub === 'list') return handleList(interaction, language);
        if (sub === 'cancel') return handleCancel(interaction, userId, language);
        if (sub === 'export') return handleExport(interaction, language);
    },
};

async function handleCreate(interaction, userId, language = getInteractionLanguage(interaction)) {
    const existing = getHostPlan(userId);
    if (existing) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planAlreadyExistsTitle'), t(language, 'planAlreadyExistsBody', { title: existing.title }))],
            flags: 64,
        });
    }

    const title = interaction.options.getString('title');
    const timeInput = interaction.options.getString('time');
    const duration = interaction.options.getInteger('duration');
    const breakMin = interaction.options.getInteger('break') ?? null;
    const cycles = interaction.options.getInteger('cycles') ?? 4;
    const limitCount = interaction.options.getInteger('limit') ?? 10;

    const delayMs = parseRelativeTime(timeInput);
    if (!delayMs || delayMs < 60_000 || delayMs > 48 * 3600_000) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planInvalidTimeTitle'), t(language, 'planInvalidTimeBody'))],
            flags: 64,
        });
    }

    if (breakMin && duration > 25) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'limitExceededTitle'), t(language, 'planPomodoroWorkMaxBody'))],
            flags: 64,
        });
    }
    if (breakMin && duration * cycles > 100) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'sessionTooLongTitle'), t(language, 'planTotalTooLongBody', {
                duration,
                cycles,
                total: duration * cycles,
            }))],
            flags: 64,
        });
    }

    const scheduledAt = new Date(Date.now() + delayMs).toISOString();

    const plan = createStudyPlan({
        hostId: userId,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        title,
        scheduledAt,
        duration,
        breakDuration: breakMin,
        cycles,
        limitCount,
    });

    const embed = buildPlanEmbed(plan, interaction.user, [], language);
    const row = buildPlanButtons(plan.id, language);

    const msg = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
    const messageId = msg?.resource?.message?.id || msg?.id;
    if (messageId) {
        updatePlanMessageId(plan.id, messageId);
    }

    schedulePlanTimers(interaction.client, plan, delayMs);
    console.log(`[PLAN] Plan #${plan.id} "${title}" created by ${userId}, starts in ${Math.round(delayMs / 60000)}m`);
}

async function handleList(interaction, language = getInteractionLanguage(interaction)) {
    const { db } = require('../utils/database');
    const plans = db.prepare(
        "SELECT * FROM study_plans WHERE guild_id = ? AND status = 'open' ORDER BY scheduled_at ASC LIMIT 10"
    ).all(interaction.guildId);

    if (plans.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`📅 ${t(language, 'planUpcomingTitle')}`)
                .setDescription(t(language, 'planNoneScheduledBody'))
                .setTimestamp()],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`📅 ${t(language, 'planUpcomingTitle')}`)
        .setTimestamp();

    for (const plan of plans) {
        const signups = getPlanSignups(plan.id);
        const ts = Math.floor(new Date(plan.scheduled_at).getTime() / 1000);
        const modeText = formatPlanMode(plan, language);

        embed.addFields({
            name: `📌 ${plan.title}`,
            value:
                `**${t(language, 'startsLabel')}:** <t:${ts}:R> (<t:${ts}:t>)\n` +
                `**${t(language, 'teamMode')}:** ${modeText}\n` +
                `**${t(language, 'planParticipantsLabel')}:** ${signups.length}/${plan.limit_count}`,
            inline: false,
        });
    }

    embed.setFooter({ text: t(language, 'planListFooter') });
    return interaction.reply({ embeds: [embed] });
}

async function handleCancel(interaction, userId, language = getInteractionLanguage(interaction)) {
    const plan = getHostPlan(userId);

    if (!plan) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planNoOpenPlanTitle'), t(language, 'planNoOpenPlanBody'))],
            flags: 64,
        });
    }

    updatePlanStatus(plan.id, 'cancelled');
    clearPlanTimers(plan.id);

    try {
        const channel = await interaction.client.channels.fetch(plan.channel_id).catch(() => null);
        if (channel && plan.message_id) {
            const msg = await channel.messages.fetch(plan.message_id).catch(() => null);
            if (msg) {
                const cancelledEmbed = new EmbedBuilder()
                    .setColor(Colors.ERROR)
                    .setTitle(`❌ ${t(language, 'planOriginalCancelledTitle', { title: plan.title })}`)
                    .setDescription(t(language, 'planOriginalCancelledBody'))
                    .setTimestamp();
                await msg.edit({ embeds: [cancelledEmbed], components: [] }).catch(() => {});
            }
        }
    } catch (_) {}

    return interaction.reply({
        embeds: [successEmbed(t(language, 'planCancelledTitle'), t(language, 'planCancelledBody', { title: plan.title }))],
        flags: 64,
    });
}

async function handlePlanJoin(interaction, planId) {
    const userId = interaction.user.id;
    const plan = getStudyPlan(planId);
    const language = plan ? getGuildLanguage(plan.guild_id, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!plan || plan.status !== 'open') {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planSessionClosedTitle'), t(language, 'planSessionClosedJoinBody'))],
            flags: 64,
        });
    }

    const signups = getPlanSignups(planId);

    if (signups.length >= plan.limit_count) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'teamFullTitle'), t(language, 'planFullBody', {
                count: plan.limit_count,
                limit: plan.limit_count,
            }))],
            flags: 64,
        });
    }

    const added = signupForPlan(planId, userId);

    if (!added) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'teamAlreadyJoinedTitle'), t(language, 'planAlreadyJoinedBody'))],
            flags: 64,
        });
    }

    const updatedSignups = getPlanSignups(planId);
    const host = await interaction.client.users.fetch(plan.host_id).catch(() => null);
    const embed = buildPlanEmbed(plan, host, updatedSignups, language);
    return interaction.update({ embeds: [embed], components: [buildPlanButtons(planId, language)] });
}

async function handlePlanLeave(interaction, planId) {
    const userId = interaction.user.id;
    const plan = getStudyPlan(planId);
    const language = plan ? getGuildLanguage(plan.guild_id, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!plan || plan.status !== 'open') {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planSessionClosedTitle'), t(language, 'planSessionClosedBody'))],
            flags: 64,
        });
    }

    if (plan.host_id === userId) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planCannotLeaveTitle'), t(language, 'planCannotLeaveBody'))],
            flags: 64,
        });
    }

    const removed = leaveFromPlan(planId, userId);
    if (!removed) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planNotJoinedTitle'), t(language, 'planNotJoinedBody'))],
            flags: 64,
        });
    }

    const updatedSignups = getPlanSignups(planId);
    const host = await interaction.client.users.fetch(plan.host_id).catch(() => null);
    const embed = buildPlanEmbed(plan, host, updatedSignups, language);
    return interaction.update({ embeds: [embed], components: [buildPlanButtons(planId, language)] });
}

async function handlePlanLaunch(interaction, planId) {
    const userId = interaction.user.id;
    const plan = getStudyPlan(planId);
    const language = plan ? getGuildLanguage(plan.guild_id, getInteractionLanguage(interaction)) : getInteractionLanguage(interaction);

    if (!plan) return interaction.reply({ embeds: [errorEmbed(t(language, 'notFoundTitle'), t(language, 'planNotFoundBody'))], flags: 64 });
    if (plan.host_id !== userId) {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planNotYourTitle'), t(language, 'planNotYourBody'))],
            flags: 64,
        });
    }
    if (plan.status !== 'open') {
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'planAlreadyLaunchedTitle'), t(language, 'planAlreadyLaunchedBody'))],
            flags: 64,
        });
    }

    return launchPlan(interaction.client, plan, interaction.channel, interaction);
}

module.exports.handlePlanJoin = handlePlanJoin;
module.exports.handlePlanLeave = handlePlanLeave;
module.exports.handlePlanLaunch = handlePlanLaunch;
module.exports.recoverPlans = recoverPlans;

function schedulePlanTimers(client, plan, delayMs) {
    const timers = {};
    const fiveMin = 5 * 60 * 1000;

    const reminderMs = delayMs - fiveMin;
    if (reminderMs > 0) {
        timers.reminder = setTimeout(() => sendReminderPing(client, plan), reminderMs);
    }

    timers.launch = setTimeout(() => launchPlan(client, plan, null, null), delayMs);
    planTimers.set(plan.id, timers);
}

async function sendReminderPing(client, plan) {
    const language = getGuildLanguage(plan.guild_id);
    try {
        const channel = await client.channels.fetch(plan.channel_id).catch(() => null);
        if (!channel) return;

        const signups = getPlanSignups(plan.id);
        const mentions = signups.map(s => `<@${s.user_id}>`).join(' ');
        const hostMention = `<@${plan.host_id}>`;
        const allMentions = mentions ? `${hostMention} ${mentions}` : hostMention;

        const ts = Math.floor(new Date(plan.scheduled_at).getTime() / 1000);
        const embed = new EmbedBuilder()
            .setColor(Colors.WARNING)
            .setTitle(`⏰ ${t(language, 'planReminderTitle', { title: plan.title })}`)
            .setDescription(t(language, 'planReminderBody', { time: `<t:${ts}:R>` }))
            .setTimestamp();

        await channel.send({ content: allMentions, embeds: [embed] }).catch(() => {});
    } catch (err) {
        console.error(`[PLAN] Reminder error for plan #${plan.id}:`, err.message);
    }
}

async function launchPlan(client, plan, channelOverride, interaction) {
    const language = getGuildLanguage(plan.guild_id);
    try {
        const freshPlan = getStudyPlan(plan.id);
        if (!freshPlan || freshPlan.status !== 'open') return;

        updatePlanStatus(plan.id, 'launched');
        clearPlanTimers(plan.id);

        const channel = channelOverride
            || await client.channels.fetch(plan.channel_id).catch(() => null);
        if (!channel) return;

        const signups = getPlanSignups(plan.id);
        await createLobbyFromPlan(client, freshPlan, signups, channel);

        if (freshPlan.message_id) {
            const orig = await channel.messages.fetch(freshPlan.message_id).catch(() => null);
            if (orig) {
                const launchedEmbed = new EmbedBuilder()
                    .setColor(Colors.SUCCESS)
                    .setTitle(`✅ ${t(language, 'planLaunchedTitle', { title: freshPlan.title })}`)
                    .setDescription(t(language, 'planLaunchedBody'))
                    .setTimestamp();
                await orig.edit({ embeds: [launchedEmbed], components: [] }).catch(() => {});
            }
        }

        if (interaction) {
            await interaction.update({
                embeds: [new EmbedBuilder()
                    .setColor(Colors.SUCCESS)
                    .setTitle(`✅ ${t(language, 'planLaunchButtonTitle')}`)
                    .setDescription(t(language, 'planLaunchButtonBody'))],
                components: [],
            }).catch(() => {});
        }

        console.log(`[PLAN] Plan #${freshPlan.id} "${freshPlan.title}" launched directly into Team Lobby`);
    } catch (err) {
        console.error(`[PLAN] Launch error for plan #${plan.id}:`, err.message);
    }
}

async function recoverPlans(client) {
    const plans = getActivePlans();
    const now = Date.now();
    let recovered = 0;

    for (const plan of plans) {
        const startMs = new Date(plan.scheduled_at).getTime();
        const delayMs = startMs - now;

        if (delayMs <= 0) {
            await launchPlan(client, plan, null, null);
        } else {
            schedulePlanTimers(client, plan, delayMs);
            recovered++;
        }
    }

    if (recovered > 0) {
        console.log(`[PLAN] Recovered ${recovered} pending plan(s) after restart`);
    }
}

function clearPlanTimers(planId) {
    const timers = planTimers.get(planId);
    if (!timers) return;
    if (timers.reminder) clearTimeout(timers.reminder);
    if (timers.launch) clearTimeout(timers.launch);
    planTimers.delete(planId);
}

function buildPlanEmbed(plan, host, signups, language = getGuildLanguage(plan.guild_id)) {
    const ts = Math.floor(new Date(plan.scheduled_at).getTime() / 1000);
    const participantList = signups.length > 0
        ? signups.map((s, i) => `\`${i + 1}.\` <@${s.user_id}>`).join('\n')
        : `*${t(language, 'planNoParticipantsBody')}*`;

    return new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`📅 ${plan.title}`)
        .setDescription(
            `**${t(language, 'planHostLabel')}:** <@${plan.host_id}>\n` +
            `**${t(language, 'startsLabel')}:** <t:${ts}:F> (<t:${ts}:R>)\n` +
            `**${t(language, 'teamMode')}:** ${formatPlanMode(plan, language)}\n` +
            `**${t(language, 'planLimitLabel')}:** ${plan.limit_count} ${t(language, 'planParticipantsLabel').toLowerCase()}\n\n` +
            `**${t(language, 'planParticipantsLabel')} (${signups.length}/${plan.limit_count}):**\n` +
            participantList
        )
        .setFooter({ text: t(language, 'planEmbedFooter') })
        .setTimestamp();
}

function buildPlanButtons(planId, language = 'en') {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`plan_join_${planId}`)
            .setLabel(`✋ ${t(language, 'planJoinButton')}`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`plan_leave_${planId}`)
            .setLabel(`❌ ${t(language, 'planLeaveButton')}`)
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`plan_launch_${planId}`)
            .setLabel(`▶️ ${t(language, 'planLaunchNowButton')}`)
            .setStyle(ButtonStyle.Primary),
    );
}

function formatPlanMode(plan, language = 'en') {
    if (plan.break_duration) {
        return `🍅 ${t(language, 'planPomodoroMode', {
            duration: plan.duration,
            break: plan.break_duration,
            cycles: plan.cycles,
        })}`;
    }
    return `📚 ${t(language, 'planStudyMode', { duration: plan.duration })}`;
}

function parseRelativeTime(input) {
    const normalized = input.toLowerCase().replace(/\s+/g, '');
    const match = normalized.match(/^in(?:(\d+)h)?(?:(\d+)m)?$/);
    if (!match || (!match[1] && !match[2])) return null;

    const hours = parseInt(match[1] ?? '0');
    const minutes = parseInt(match[2] ?? '0');
    const total = (hours * 60 + minutes) * 60 * 1000;
    return total > 0 ? total : null;
}

async function handleExport(interaction, language = getInteractionLanguage(interaction)) {
    const now = new Date();
    const plans = db.prepare(`
        SELECT * FROM study_plans
        WHERE guild_id = ? AND status = 'open' AND scheduled_at > ?
        ORDER BY scheduled_at ASC
    `).all(interaction.guildId, now.toISOString());

    if (!plans.length) {
        return interaction.reply({
            embeds: [errorEmbed(
                'No Upcoming Plans',
                'There are no upcoming study plans in this server to export.'
            )],
            flags: 64,
        });
    }

    const events = plans.map(plan => {
        const startTime = new Date(plan.scheduled_at);
        const durationMins = Number(plan.duration) || 25;
        const endTime = new Date(startTime.getTime() + durationMins * 60000);
        return {
            id: `plan_${plan.id}`,
            startTime,
            endTime,
            title: plan.title,
            subject: 'Group Study',
            duration: durationMins,
            type: plan.break_duration ? 'Pomodoro' : 'Study',
            description: `Hosted by <@${plan.host_id}>`,
            alarmMinutes: 5,
        };
    });

    const icsContent = generateIcs(events);
    const attachment = new AttachmentBuilder(Buffer.from(icsContent, 'utf8'), {
        name: `pomobot-calendar-${interaction.guildId}.ics`,
    });

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle('📅 Study Plans Exported')
        .setDescription(
            `Exported **${plans.length}** upcoming plan(s) to iCal format.\n\n` +
            'Import the file into Google Calendar, Apple Calendar, or Outlook to get reminders and see your schedule.'
        )
        .addFields(
            { name: 'Plans Included', value: `${plans.length}`, inline: true },
            { name: 'Time Range', value: plans.length > 0 ? `${Math.round((new Date(plans[plans.length - 1].scheduled_at).getTime() - Date.now()) / 86400000)} days ahead` : '', inline: true },
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed], files: [attachment], flags: 64 });
}

module.exports.parseRelativeTime = parseRelativeTime;
