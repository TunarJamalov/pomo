/**
 * /habit — a HabitKit-style habit tracker: yes/no or count habits, daily or
 * N days a week, ticked off with one button and shown as a grid of days.
 */
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { botGuildId } = require('../utils/interactionContext');
const habits = require('../utils/habits');

const COMMON_ZONES = [
    'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/Moscow', 'Asia/Baku',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Sydney',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
    'America/Mexico_City', 'Africa/Cairo',
];

function goalText(language, habit) {
    const perDay = habit.target > 1
        ? t(language, 'habitGoalCount', { target: habit.target, unit: habit.unit || t(language, 'habitTimesUnit') })
        : null;
    const schedule = habit.weekly_target
        ? t(language, 'habitGoalWeekly', { days: habit.weekly_target })
        : t(language, 'habitGoalDaily');
    return perDay ? `${perDay}, ${schedule}` : schedule;
}

function buildCheckMessage(userId, overview, language, note = null) {
    const lines = overview.items.map(item => {
        if (item.automatic) {
            return `${item.todayCount > 0 ? '✅' : '⬜'} ${item.emoji} **${item.name}**: ${t(language, 'habitFocusLine', { minutes: item.todayCount })}`;
        }
        const done = item.todayCount >= item.target;
        const progress = item.target > 1 ? ` ${item.todayCount}/${item.target}${item.unit ? ` ${item.unit}` : ''}` : '';
        const streak = item.streaks.current > 0 ? ` · 🔥 ${item.streaks.current}` : '';
        return `${done ? '✅' : '⬜'} ${item.emoji} **${item.name}**${progress}${streak}`;
    });

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`🗓️ ${t(language, 'habitCheckTitle')}`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${overview.today} · ${overview.timeZone} · ${t(language, 'habitRewardFooter', { cap: habits.DAILY_REWARD_CAP })}` });
    if (note) embed.addFields({ name: '​', value: note });

    const buttons = overview.items.filter(item => !item.automatic).map(item => new ButtonBuilder()
        .setCustomId(`habit_tick_${userId}_${item.id}`)
        .setLabel(`${item.target > 1 ? '+1 ' : ''}${item.name}`.slice(0, 40))
        .setEmoji(/^\p{Extended_Pictographic}/u.test(item.emoji) ? item.emoji.match(/^\p{Extended_Pictographic}️?/u)[0] : '✅')
        .setStyle(item.todayCount >= item.target ? ButtonStyle.Success : ButtonStyle.Secondary));
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    return { embeds: [embed], components: rows };
}

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('habit')
        .setDescription('Track daily habits with a grid of days, like HabitKit')
        .addSubcommand(sub => sub
            .setName('check')
            .setDescription("Tick off today's habits"))
        .addSubcommand(sub => sub
            .setName('view')
            .setDescription('See your habit grids and streaks'))
        .addSubcommand(sub => sub
            .setName('add')
            .setDescription('Start tracking a new habit')
            .addStringOption(o => o.setName('name').setDescription('e.g. Read, Drink water, Workout').setRequired(true).setMaxLength(40))
            .addStringOption(o => o.setName('emoji').setDescription('An emoji for the habit, e.g. 📖').setMaxLength(16))
            .addIntegerOption(o => o.setName('goal').setDescription('How many per day (leave empty for a simple yes/no habit)').setMinValue(2).setMaxValue(1000))
            .addStringOption(o => o.setName('unit').setDescription('Unit for the goal, e.g. glasses, pages, minutes').setMaxLength(16))
            .addIntegerOption(o => o.setName('days_per_week').setDescription('Only needed on some days, e.g. 3 = three days a week').setMinValue(1).setMaxValue(6)))
        .addSubcommand(sub => sub
            .setName('log')
            .setDescription('Add to (or correct) today’s count for a habit')
            .addStringOption(o => o.setName('habit').setDescription('Which habit').setRequired(true).setAutocomplete(true))
            .addIntegerOption(o => o.setName('amount').setDescription('How much to add today (negative to undo)').setMinValue(-1000).setMaxValue(1000)))
        .addSubcommand(sub => sub
            .setName('remove')
            .setDescription('Stop tracking a habit (its history is kept)')
            .addStringOption(o => o.setName('habit').setDescription('Which habit').setRequired(true).setAutocomplete(true)))
        .addSubcommand(sub => sub
            .setName('timezone')
            .setDescription('Set the time zone your habit days follow')
            .addStringOption(o => o.setName('zone').setDescription('e.g. Europe/Baku, America/New_York').setRequired(true).setAutocomplete(true))),

    async autocomplete(interaction) {
        const focused = interaction.options.getFocused(true);
        const query = String(focused.value || '').toLowerCase();
        if (focused.name === 'zone') {
            const zones = (Intl.supportedValuesOf?.('timeZone') || COMMON_ZONES);
            const pool = query ? zones.filter(z => z.toLowerCase().includes(query)) : COMMON_ZONES;
            return interaction.respond(pool.slice(0, 25).map(z => ({ name: z, value: z })));
        }
        const list = habits.listHabits(interaction.user.id)
            .filter(h => h.name.toLowerCase().includes(query))
            .slice(0, 25)
            .map(h => ({ name: `${h.emoji} ${h.name}`.slice(0, 100), value: String(h.id) }));
        return interaction.respond(list);
    },

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        const guildId = botGuildId(interaction);
        const sub = interaction.options.getSubcommand();

        if (sub === 'add') {
            const result = habits.createHabit(userId, {
                name: interaction.options.getString('name', true),
                emoji: interaction.options.getString('emoji'),
                target: interaction.options.getInteger('goal') || 1,
                unit: interaction.options.getString('unit'),
                weeklyTarget: interaction.options.getInteger('days_per_week'),
            });
            if (result.error === 'limit') {
                const max = habits.getHabitLimit(userId);
                const body = t(language, 'habitLimitBody', { max })
                    + (max < habits.PRO_HABITS ? `\n${t(language, 'habitLimitProHint', { max: habits.PRO_HABITS })}` : '');
                return interaction.reply({ embeds: [errorEmbed(t(language, 'habitTitle'), body)], flags: 64 });
            }
            if (result.error === 'duplicate') {
                return interaction.reply({ embeds: [errorEmbed(t(language, 'habitTitle'), t(language, 'habitDuplicateBody', { name: interaction.options.getString('name', true) }))], flags: 64 });
            }
            const { habit } = result;
            return interaction.reply({
                embeds: [successEmbed(t(language, 'habitAddedTitle'), t(language, 'habitAddedBody', {
                    emoji: habit.emoji, name: habit.name, goal: goalText(language, habit),
                }))],
            });
        }

        if (sub === 'check') {
            const overview = habits.buildHabitOverview(userId, guildId);
            if (overview.items.length === 1) {
                return interaction.reply({ content: t(language, 'habitNoneBody'), ...buildCheckMessage(userId, overview, language) });
            }
            return interaction.reply(buildCheckMessage(userId, overview, language));
        }

        if (sub === 'view') {
            await interaction.deferReply();
            const overview = habits.buildHabitOverview(userId, guildId);
            const { renderHabitCard } = require('../utils/habitCard');
            const buffer = renderHabitCard(overview, {
                title: t(language, 'habitViewTitle', { user: interaction.user.username }),
                streakLabel: item => t(language, item.streaks.unit === 'week' ? 'habitStreakWeeks' : 'habitStreakLabel', item.streaks),
                todayLabel: item => item.automatic
                    ? t(language, 'habitFocusToday', { minutes: item.todayCount })
                    : t(language, 'habitTodayLabel', { count: item.todayCount, target: item.target }),
            });
            return interaction.editReply({
                content: overview.items.length === 1 ? t(language, 'habitNoneBody') : undefined,
                files: [new AttachmentBuilder(buffer, { name: 'habits.png' })],
            });
        }

        if (sub === 'log') {
            const habitId = Number(interaction.options.getString('habit', true));
            const amount = interaction.options.getInteger('amount') ?? 1;
            const day = habits.localDay(habits.resolveTimeZone(userId, guildId));
            const result = Number.isInteger(habitId) && amount !== 0 ? habits.logHabit(userId, habitId, day, amount) : null;
            if (!result) {
                return interaction.reply({ embeds: [errorEmbed(t(language, 'habitTitle'), t(language, 'habitNotFound'))], flags: 64 });
            }
            const body = t(language, 'habitLoggedBody', {
                emoji: result.habit.emoji, name: result.habit.name, count: result.count, target: result.habit.target,
            }) + (result.rewarded ? ` · +${result.rewarded} 💧` : '');
            return interaction.reply({ content: body });
        }

        if (sub === 'remove') {
            const habit = habits.getHabit(userId, Number(interaction.options.getString('habit', true)));
            if (!habit || !habits.archiveHabit(userId, habit.id)) {
                return interaction.reply({ embeds: [errorEmbed(t(language, 'habitTitle'), t(language, 'habitNotFound'))], flags: 64 });
            }
            return interaction.reply({ content: t(language, 'habitRemovedBody', { name: `${habit.emoji} ${habit.name}` }), flags: 64 });
        }

        if (sub === 'timezone') {
            const zone = habits.setTimeZone(userId, interaction.options.getString('zone', true));
            if (!zone) {
                return interaction.reply({ embeds: [errorEmbed(t(language, 'habitTitle'), t(language, 'habitTimezoneInvalid'))], flags: 64 });
            }
            return interaction.reply({ content: t(language, 'habitTimezoneSetBody', { zone, day: habits.localDay(zone) }), flags: 64 });
        }
        return null;
    },

    /** Buttons on a /habit check message: habit_tick_<ownerId>_<habitId> */
    async handleHabitButton(interaction) {
        const language = getInteractionLanguage(interaction);
        const [, , ownerId, habitIdText] = interaction.customId.split('_');
        if (interaction.user.id !== ownerId) {
            return interaction.reply({ content: t(language, 'habitNotYours'), flags: 64 });
        }
        const guildId = botGuildId(interaction);
        const day = habits.localDay(habits.resolveTimeZone(ownerId, guildId));
        const result = habits.logHabit(ownerId, Number(habitIdText), day, 1);
        const overview = habits.buildHabitOverview(ownerId, guildId);
        if (!result) {
            return interaction.update(buildCheckMessage(ownerId, overview, language, t(language, 'habitNotFound')));
        }
        const note = result.rewarded ? `+${result.rewarded} 💧` : null;
        return interaction.update(buildCheckMessage(ownerId, overview, language, note));
    },
};

module.exports.buildCheckMessage = buildCheckMessage;
