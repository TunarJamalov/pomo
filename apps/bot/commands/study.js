/**
 * /study [minutes] [title] — Start a Pomodoro study session.
 */

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, progressBar, formatTime } = require('../utils/embeds');
const { getOrCreateUser, getPastSessionTitles, isUserInAnyActiveSession, getOrCreateGuildSettings, getActiveTodoByPosition, sessionRepository, transactionManager } = require('../utils/database');
const { startStudyTimer, buildStudyControlRow } = require('../utils/timerManager');
const { normalizeLanguage, t } = require('../utils/i18n');
const { needsDmTimer, botGuildId, openTimerDm, postDmTimerNotice } = require('../utils/interactionContext');

const SUBJECT_CHOICES = [
    { name: 'General', value: 'general' },
    { name: 'Math', value: 'math' },
    { name: 'Language', value: 'language' },
    { name: 'Coding', value: 'coding' },
    { name: 'Reading', value: 'reading' },
    { name: 'Exam', value: 'exam' },
];

function subjectLabel(subject) {
    return SUBJECT_CHOICES.find(choice => choice.value === subject)?.name || 'General';
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('study')
        .setDescription('Start a Pomodoro study session')
        .addIntegerOption(option =>
            option.setName('minutes')
                .setDescription('Session duration in minutes (5-120)')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(120))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title for your study session')
                .setRequired(false)
                .setMaxLength(100)
                .setAutocomplete(true))
        .addIntegerOption(option =>
            option.setName('task')
                .setDescription('Todo number to link this focus session to')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(10))
        .addStringOption(option =>
            option.setName('subject')
                .setDescription('Subject or category for this focus session')
                .setRequired(false)
                .addChoices(...SUBJECT_CHOICES)),

    async execute(interaction) {
        return startStudySession(interaction, {
            minutes: interaction.options.getInteger('minutes'),
            title: interaction.options.getString('title'),
            taskNumber: interaction.options.getInteger('task'),
            subject: interaction.options.getString('subject'),
        });
    },

    /**
     * Autocomplete handler for the 'title' option.
     * Returns the user's past session titles, filtered by current input.
     */
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const userId = interaction.user.id;

        const pastTitles = getPastSessionTitles(userId);

        const filtered = pastTitles
            .filter(title => title.toLowerCase().includes(focusedValue))
            .slice(0, 25)
            .map(title => ({ name: title, value: title }));

        // If nothing matches but user typed something, offer it as a new option
        if (filtered.length === 0 && focusedValue.length > 0) {
            filtered.push({ name: `📝 New: "${focusedValue}"`, value: focusedValue });
        }

        await interaction.respond(filtered);
    },
};

function getInteractionLanguage(interaction) {
    if (!interaction.guildId || interaction.guild === null) {
        return normalizeLanguage(interaction.locale || 'en');
    }
    if (typeof getOrCreateGuildSettings !== 'function') {
        return normalizeLanguage(interaction.guildLocale || interaction.locale || 'en');
    }
    const settings = getOrCreateGuildSettings(interaction.guildId);
    return normalizeLanguage(settings.language || interaction.guildLocale || interaction.locale || 'en');
}

/**
 * Starts a focus session. Used by /study and by the "Again" button on the
 * session-complete card (utils/nextSteps.js), which passes the last session's values.
 */
async function startStudySession(interaction, { minutes, title: customTitle = null, taskNumber = null, subject: chosenSubject = null }) {
    const language = getInteractionLanguage(interaction);
    const subject = chosenSubject || 'general';
    const userId = interaction.user.id;
    let linkedTodo = null;
    let title = customTitle || t(language, 'studySession');

    // ── Hard limit to prevent AFK farming ───────────────────────────
    const MAX_STUDY_MIN = 120;
    if (minutes > MAX_STUDY_MIN) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'sessionTooLongTitle'),
                t(language, 'sessionTooLongBody', { minutes: MAX_STUDY_MIN })
            )],
            flags: 64,
        });
    }
    // ───────────────────────────────────────────────────────────────

    // Ensure user exists in DB
    getOrCreateUser(userId);
    linkedTodo = taskNumber ? getActiveTodoByPosition(userId, taskNumber) : null;
    if (!customTitle && linkedTodo) {
        title = linkedTodo.content;
    }

    // Check for existing active session (solo or team)


    if (taskNumber && !linkedTodo) {
        return interaction.reply({
            embeds: [errorEmbed(
                t(language, 'studyTaskNotFoundTitle'),
                t(language, 'studyTaskNotFoundBody', { number: taskNumber })
            )],
            flags: 64,
        });
    }

    // Build start embed
    const embed = new EmbedBuilder()
        .setColor(Colors.STUDY)
        .setTitle(`📚 ${title}`)
        .setDescription(
            `**${t(language, 'durationLabel')}:** ${formatTime(minutes)}\n` +
            `**Subject:** ${subjectLabel(subject)}\n` +
            (linkedTodo ? `**${t(language, 'linkedTaskLabel')}:** ${linkedTodo.content}\n` : '') +
            `**${t(language, 'elapsedLabel')}:** 0m\n` +
            `**${t(language, 'remainingLabel')}:** ${formatTime(minutes)}\n\n` +
            `${progressBar(0, minutes, 20)}`
        )
        .setFooter({ text: t(language, 'startedBy', { username: interaction.user.username }) })
        .setTimestamp();

    // Outside servers the bot is in, the live timer runs in the user's DMs
    let dm = null;
    if (needsDmTimer(interaction)) {
        if (isUserInAnyActiveSession(userId)) {
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'activeSessionBody'))],
                flags: 64,
            });
        }
        await interaction.deferReply();
        dm = await openTimerDm(interaction);
        if (!dm) {
            return interaction.editReply({ embeds: [errorEmbed(t(language, 'dmTimerFailedTitle'), t(language, 'dmTimerFailedBody'))] });
        }
    }

    // Create DB session first so we have the sessionId for the cancel button
    let session;
    try {
        session = await transactionManager.execute(ctx => {
            // IMPORTANT: Check for active session inside the transaction lock
            // to prevent race conditions where a user spams the command
            if (isUserInAnyActiveSession(userId)) {
                throw new Error('ACTIVE_SESSION');
            }

            return sessionRepository.createSession(ctx, {
                userId,
                guildId: botGuildId(interaction),
                channelId: dm ? dm.id : interaction.channelId,
                duration: minutes,
                title,
                todoId: linkedTodo?.id || null,
                subject
            });
        });
    } catch (error) {
        if (error.message === 'ACTIVE_SESSION') {
            const payload = { embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'activeSessionBody'))] };
            return dm ? interaction.editReply(payload) : interaction.reply({ ...payload, flags: 64 });
        }
        throw error;
    }

    const row = buildStudyControlRow({ ...session, paused: 0 }, language);

    try {
        // Send and record message ID
        let messageId;
        let timerMessage = null;
        if (dm) {
            timerMessage = await dm.send({ embeds: [embed], components: [row] });
            messageId = timerMessage.id;
        } else {
            const reply = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
            // reply.resource.message.id is the actual Discord message ID.
            messageId = reply?.resource?.message?.id;
        }
        if (messageId) {
            await transactionManager.execute(ctx => {
                sessionRepository.updateMessageId(ctx, session.id, messageId);
            });
            session.message_id = messageId;
        }

        // Start the timer and trigger friend notifications
        startStudyTimer(interaction.client, session, true);
        if (timerMessage) await postDmTimerNotice(interaction, language, minutes, timerMessage);
    } catch (err) {
        console.error('[STUDY] Failed to reply to study command, deleting ghost session:', err.message);
        await transactionManager.execute(ctx => {
            sessionRepository.cancelSession(ctx, session.id);
        });
        if (dm) {
            await interaction.editReply({ embeds: [errorEmbed(t(language, 'dmTimerFailedTitle'), t(language, 'dmTimerFailedBody'))] }).catch(() => {});
        }
    }
}

module.exports.startStudySession = startStudySession;
