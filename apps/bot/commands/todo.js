/**
 * /todo — Personal task list with water rewards.
 *
 * Subcommands:
 *   /todo add [task]      — Add a new task (max 10 active)
 *   /todo list            — View your active tasks
 *   /todo done [number]   — Complete a task → earn +1 💧
 *   /todo delete [number] — Remove a task without reward
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors, Pets } = require('../utils/constants');
const { errorEmbed } = require('../utils/embeds');
const {
    getOrCreateUser,
    incrementUser,
    addTodo,
    getActiveTodos,
    completeTodo,
    deleteTodo,
    getCompletedTodos,
    getActivePet,
} = require('../utils/database');
const { getInteractionLanguage, t } = require('../utils/i18n');

// Base water reward per completed task (Magic Quill doubles this to +2)
const BASE_WATER_PER_TASK = 1;

module.exports = {
    cooldown: 3,
    data: new SlashCommandBuilder()
        .setName('todo')
        .setDescription('Manage your personal task list')
        // ── add ──
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new task to your list')
                .addStringOption(opt =>
                    opt.setName('task1')
                        .setDescription('What do you need to do?')
                        .setRequired(true)
                        .setMaxLength(200)
                )
                .addStringOption(opt =>
                    opt.setName('task2')
                        .setDescription('Additional task (optional)')
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addStringOption(opt =>
                    opt.setName('task3')
                        .setDescription('Additional task (optional)')
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addStringOption(opt =>
                    opt.setName('task4')
                        .setDescription('Additional task (optional)')
                        .setRequired(false)
                        .setMaxLength(200)
                )
                .addStringOption(opt =>
                    opt.setName('task5')
                        .setDescription('Additional task (optional)')
                        .setRequired(false)
                        .setMaxLength(200)
                ))
        // ── list ──
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View your active tasks'))
        // ── done ──
        .addSubcommand(sub =>
            sub.setName('done')
                .setDescription('Mark a task as completed and earn 💧')
                .addIntegerOption(opt =>
                    opt.setName('number')
                        .setDescription('Task number from your list')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10)
                ))
        // ── delete ──
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Remove a task without completing it')
                .addIntegerOption(opt =>
                    opt.setName('number')
                        .setDescription('Task number from your list')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10)
                )),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const sub = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        getOrCreateUser(userId);

        switch (sub) {
            case 'add':    return handleAdd(interaction, userId, language);
            case 'list':   return handleList(interaction, userId, language);
            case 'done':   return handleDone(interaction, userId, language);
            case 'delete': return handleDelete(interaction, userId, language);
        }
    },
};

// ─────────────────────────────────────────────────────────────────
// Subcommand Handlers
// ─────────────────────────────────────────────────────────────────

async function handleAdd(interaction, userId, language) {
    const tasks = [];
    for (let i = 1; i <= 5; i++) {
        const val = interaction.options.getString(`task${i}`);
        if (val && val.trim().length > 0) {
            tasks.push(val.trim());
        }
    }

    let addedCount = 0;
    for (const content of tasks) {
        const result = addTodo(userId, content);
        if (result.success) {
            addedCount++;
        } else {
            // Stop adding if we hit the limit
            break;
        }
    }

    if (addedCount === 0) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'todoTaskLimitTitle'),
                t(language, 'todoTaskLimitBody')
            )],
            flags: 64,
        });
    }

    const todos = getActiveTodos(userId);
    const addedText = addedCount > 1 
        ? `Added ${addedCount} tasks to your list.` 
        : t(language, 'todoAddedBody', { task: tasks[0] });

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`📋 ${t(language, 'todoAddedTitle')}`)
        .setDescription(
            `${addedText}\n\n` +
            buildTaskList(todos, language) +
            `\n\n*${t(language, 'todoDoneHint')}*`
        )
        .setFooter({ text: t(language, 'todoActiveCount', { count: todos.length }) })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleList(interaction, userId, language) {
    const todos = getActiveTodos(userId);
    const recent = getCompletedTodos(userId);

    if (todos.length === 0 && recent.length === 0) {
        return interaction.reply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle(`📋 ${t(language, 'todoYourListTitle')}`)
                .setDescription(t(language, 'todoEmptyBody'))
                .setTimestamp()
            ],
        });
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`📋 ${t(language, 'todoListTitle', { username: interaction.user.username })}`)
        .setTimestamp();

    if (todos.length > 0) {
        embed.addFields({
            name: `📌 ${t(language, 'todoActiveTasks')} (${todos.length}/10)`,
            value: buildTaskList(todos, language),
        });
    } else {
        embed.addFields({
            name: `📌 ${t(language, 'todoActiveTasks')}`,
            value: `*${t(language, 'todoNoActiveTasks')} 🎉*`,
        });
    }

    if (recent.length > 0) {
        const completedText = recent
            .map(t => `~~${t.content}~~ ✅${Number(t.focus_minutes || 0) > 0 ? ` (${formatFocusMinutes(t.focus_minutes)})` : ''}`)
            .join('\n');
        embed.addFields({
            name: `✅ ${t(language, 'todoRecentlyCompleted')}`,
            value: completedText,
        });
    }

    embed.setFooter({ text: t(language, 'todoListFooter') });

    await interaction.reply({ embeds: [embed] });
}

async function handleDone(interaction, userId, language) {
    const position = interaction.options.getInteger('number');

    const result = completeTodo(userId, position);

    if (!result.success) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'todoNotFoundTitle'),
                t(language, 'todoNotFoundBody', { position })
            )],
            flags: 64,
        });
    }

    // Determine water reward (Magic Quill gives +2 instead of +1)
    const activePet = getActivePet(userId);
    const hasMagicQuill = activePet && Pets[activePet.pet_key]?.special === 'todo_bonus';
    const waterReward = hasMagicQuill ? BASE_WATER_PER_TASK + 1 : BASE_WATER_PER_TASK;
    const quillText = hasMagicQuill ? t(language, 'todoMagicQuillBonus') : '';

    // Award water
    incrementUser(userId, 'water', waterReward);
    const user = getOrCreateUser(userId);

    const remaining = getActiveTodos(userId);

    const embed = new EmbedBuilder()
        .setColor(Colors.SUCCESS)
        .setTitle(`✅ ${t(language, 'todoCompletedTitle')}`)
        .setDescription(
            `${t(language, 'todoCompletedBody', { task: result.todo.content })}\n\n` +
            `${t(language, 'todoWaterEarnedLine', { water: waterReward, bonus: quillText, balance: user.water })}\n\n` +
            (remaining.length > 0
                ? `**${t(language, 'todoRemainingTasks')}**\n${buildTaskList(remaining, language)}`
                : `*${t(language, 'todoAllCompleted')} 🌱*`)
        )
        .setTimestamp();

    let challengeNews = [];
    try { challengeNews = require('../utils/challenges').recordGoalCompleted(userId); } catch (err) {
        console.error('[TODO] Goal challenge progress failed:', err.message);
    }
    await interaction.reply({
        content: challengeNews.length ? challengeNews.join('\n') : undefined,
        embeds: [embed],
        allowedMentions: { users: [userId] },
    });
}

async function handleDelete(interaction, userId, language) {
    const position = interaction.options.getInteger('number');

    const result = deleteTodo(userId, position);

    if (!result.success) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'todoNotFoundTitle'),
                t(language, 'todoNotFoundBody', { position })
            )],
            flags: 64,
        });
    }

    const remaining = getActiveTodos(userId);

    const embed = new EmbedBuilder()
        .setColor(Colors.WARNING)
        .setTitle(`🗑️ ${t(language, 'todoDeletedTitle')}`)
        .setDescription(
            `${t(language, 'todoDeletedBody', { task: result.todo.content })}\n` +
            `*(${t(language, 'todoDeleteNoReward')})*\n\n` +
            (remaining.length > 0
                ? `**${t(language, 'todoRemainingTasks')}**\n${buildTaskList(remaining, language)}`
                : `*${t(language, 'todoListNowEmpty')}*`)
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Build a numbered task list string from an array of todo rows.
 */
function buildTaskList(todos, language = 'en') {
    if (todos.length === 0) return `*${t(language, 'todoNoActiveTasksShort')}*`;
    return todos
        .map((t, i) => {
            const focus = Number(t.focus_minutes || 0) > 0 ? ` · ${formatFocusMinutes(t.focus_minutes)}` : '';
            return `\`${i + 1}.\` ${t.content}${focus}`;
        })
        .join('\n');
}

function formatFocusMinutes(minutes) {
    const total = Number(minutes || 0);
    if (total < 60) return `${total}m`;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
