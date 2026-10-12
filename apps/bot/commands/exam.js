const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { getInteractionLanguage, t } = require('../utils/i18n');
const {
    getOrCreateUser,
    getUserExams,
    addUserExam,
    deleteUserExam,
    db,
} = require('../utils/database');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('exam')
        .setDescription('Track your upcoming exams, countdowns, and study targets')
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('View your upcoming exams and countdowns'))
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Add a new exam or deadline to track')
                .addStringOption(opt =>
                    opt.setName('title')
                        .setDescription('Exam name (e.g. SAT, Calculus Midterm)')
                        .setRequired(true))
                .addStringOption(opt =>
                    opt.setName('date')
                        .setDescription('Exam date in YYYY-MM-DD format (e.g. 2026-11-15)')
                        .setRequired(true))
                .addIntegerOption(opt =>
                    opt.setName('target_hours')
                        .setDescription('Target total focus hours for this exam (e.g. 40)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(1000)))
        .addSubcommand(sub =>
            sub.setName('delete')
                .setDescription('Delete an exam from your tracker')
                .addIntegerOption(opt =>
                    opt.setName('id')
                        .setDescription('Exam ID to delete (find ID via /exam list)')
                        .setRequired(true))),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            return handleList(interaction, userId, language);
        } else if (subcommand === 'add') {
            return handleAdd(interaction, userId, language);
        } else if (subcommand === 'delete') {
            return handleDelete(interaction, userId, language);
        }
    },
};

async function handleList(interaction, userId, language) {
    const exams = getUserExams(userId);
    if (!exams.length) {
        const embed = new EmbedBuilder()
            .setColor(Colors.INFO)
            .setTitle(`📚 ${t(language, 'examListTitle') || 'Upcoming Exams & Deadlines'}`)
            .setDescription(
                t(language, 'examEmptyList') ||
                'You have no exams tracked yet!\n\nUse `/exam add title:"SAT" date:"2026-11-15"` to start tracking your exam countdowns and daily focus goals.'
            )
            .setTimestamp();
        return interaction.reply({ embeds: [embed], flags: 64 });
    }

    const totalMinutesResult = db.prepare(`
        SELECT SUM(duration) as total_mins
        FROM study_sessions
        WHERE user_id = ? AND completed = 1 AND title != '__break__'
    `).get(userId);
    const userTotalHours = Math.round(((totalMinutesResult?.total_mins || 0) / 60) * 10) / 10;

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle(`📚 ${t(language, 'examListTitle') || 'Your Exam Countdowns'}`)
        .setDescription(`Tracked exams for <@${userId}>:`)
        .setTimestamp();

    const nowMs = Date.now();

    for (const exam of exams) {
        const examDateObj = new Date(`${exam.exam_date}T12:00:00Z`);
        const examTs = Math.floor(examDateObj.getTime() / 1000);
        const todayNoon = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00Z');
        const diffDays = Math.ceil((examDateObj.getTime() - todayNoon.getTime()) / (1000 * 60 * 60 * 24));

        let statusText = '';
        if (diffDays < 0) {
            statusText = `⚠️ Passed (${Math.abs(diffDays)} days ago)`;
        } else if (diffDays === 0) {
            statusText = `🚨 **TODAY IS EXAM DAY!**`;
        } else {
            statusText = `⏳ Countdown: <t:${examTs}:R> (in ${diffDays} days)\n📅 Date: <t:${examTs}:D>`;
        }

        let targetLine = '';
        if (exam.target_hours > 0) {
            const dailyRec = diffDays > 0 ? Math.round((exam.target_hours / diffDays) * 10) / 10 : exam.target_hours;
            targetLine = `\n🎯 Target: **${exam.target_hours}h** | Daily Rec: **~${dailyRec}h/day**`;
        }

        embed.addFields({
            name: `#${exam.id} — 📖 ${exam.title}`,
            value: `${statusText}${targetLine}`,
            inline: false,
        });
    }

    embed.setFooter({ text: 'Tip: Use /exam delete id:<ID> to remove an exam.' });

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleAdd(interaction, userId, language) {
    const title = interaction.options.getString('title').trim();
    const dateStr = interaction.options.getString('date').trim();
    const targetHours = interaction.options.getInteger('target_hours') || 0;

    // Validate YYYY-MM-DD regex
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'invalidDateTitle') || 'Invalid Date Format',
                'Please use **YYYY-MM-DD** format (e.g. `2026-11-15`).'
            )],
            flags: 64,
        });
    }

    const examDateObj = new Date(`${dateStr}T12:00:00Z`);
    if (isNaN(examDateObj.getTime())) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'invalidDateTitle') || 'Invalid Date',
                'The date provided is not a valid date.'
            )],
            flags: 64,
        });
    }

    const examId = addUserExam(userId, title, dateStr, targetHours);
    const examTs = Math.floor(examDateObj.getTime() / 1000);

    const embed = successEmbed(
        t(language, 'examAddedTitle') || 'Exam Added!',
        `Tracked **${title}** for <t:${examTs}:D> (<t:${examTs}:R>).\nID: **#${examId}**${targetHours ? `\nTarget Focus: **${targetHours} hours**` : ''}`
    );

    return interaction.reply({ embeds: [embed], flags: 64 });
}

async function handleDelete(interaction, userId, language) {
    const examId = interaction.options.getInteger('id');
    const deleted = deleteUserExam(userId, examId);

    if (!deleted) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'examNotFoundTitle') || 'Exam Not Found',
                `No exam found with ID **#${examId}**.`
            )],
            flags: 64,
        });
    }

    return interaction.reply({
        embeds: [successEmbed(
            t(language, 'examDeletedTitle') || 'Exam Removed',
            `Exam **#${examId}** has been deleted from your tracker.`
        )],
        flags: 64,
    });
}
