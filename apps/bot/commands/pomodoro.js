/**
 * /pomodoro [work] [break] [cycles] [title] - Start a Pomodoro cycle session.
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { Colors } = require('../utils/constants');
const { errorEmbed, progressBar, formatTime } = require('../utils/embeds');
const {
    getOrCreateUser,
    transactionManager, sessionRepository,
    updateSessionPomodoroData,
    getActiveSessionForUser,
    getPastSessionTitles,
    isUserInAnyActiveSession,
} = require('../utils/database');
const { startStudyTimer, isTrialEligible, buildTrialButton } = require('../utils/timerManager');
const { getInteractionLanguage, t } = require('../utils/i18n');
const { needsDmTimer, botGuildId, openTimerDm, postDmTimerNotice } = require('../utils/interactionContext');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('pomodoro')
        .setDescription('Start an automated Pomodoro work/break cycle')
        .addIntegerOption(option =>
            option.setName('work')
                .setDescription('Work duration in minutes (default: 25, max: 120)')
                .setRequired(false)
                .setMinValue(5)
                .setMaxValue(120))
        .addIntegerOption(option =>
            option.setName('break')
                .setDescription('Break duration in minutes (default: 5)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(30))
        .addIntegerOption(option =>
            option.setName('cycles')
                .setDescription('Number of complete cycles (default: 4, max: 12)')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(12))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Title for your Pomodoro session')
                .setRequired(false)
                .setMaxLength(100)
                .setAutocomplete(true)),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const workMin = interaction.options.getInteger('work') || 25;
        const breakMin = interaction.options.getInteger('break') || 5;
        const cycles = interaction.options.getInteger('cycles') || 4;
        const title = interaction.options.getString('title') || t(language, 'pomodoroDefaultTitle');
        const userId = interaction.user.id;

        const MAX_WORK_MIN = 120;
        const MAX_CYCLES = 12;
        const MAX_TOTAL_WORK_MIN = 400;

        if (workMin > MAX_WORK_MIN) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'limitExceededTitle'),
                    t(language, 'pomodoroMaxWorkBody', { minutes: MAX_WORK_MIN }),
                )],
                flags: 64,
            });
        }

        if (cycles > MAX_CYCLES) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'limitExceededTitle'),
                    t(language, 'pomodoroMaxCyclesBody', { cycles: MAX_CYCLES }),
                )],
                flags: 64,
            });
        }

        const totalWorkMin = workMin * cycles;
        if (totalWorkMin > MAX_TOTAL_WORK_MIN) {
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'sessionTooLongTitle'),
                    t(language, 'pomodoroTotalTooLongBody', {
                        work: workMin,
                        cycles,
                        total: totalWorkMin,
                        max: MAX_TOTAL_WORK_MIN,
                    }),
                )],
                flags: 64,
            });
        }

        getOrCreateUser(userId);


        const embed = new EmbedBuilder()
            .setColor(Colors.STUDY)
            .setTitle(t(language, 'pomodoroStartTitle', { cycle: 1, cycles, title }))
            .setDescription(
                `**${t(language, 'durationLabel')}:** ${formatTime(workMin)}\n` +
                `**${t(language, 'elapsedLabel')}:** 0m\n` +
                `**${t(language, 'remainingLabel')}:** ${formatTime(workMin)}\n\n` +
                `${progressBar(0, workMin, 20)}\n\n` +
                `*${t(language, 'pomodoroGoalLine', { cycles, work: workMin, break: breakMin })}*`
            )
            .setFooter({ text: t(language, 'startedBy', { username: interaction.user.username }) })
            .setTimestamp();

        // Outside servers the bot is in, the live timer runs in the user's DMs
        let dm = null;
        if (needsDmTimer(interaction)) {
            if (isUserInAnyActiveSession(userId)) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'pomodoroActiveSessionBody'))],
                    flags: 64,
                });
            }
            await interaction.deferReply();
            dm = await openTimerDm(interaction);
            if (!dm) {
                return interaction.editReply({ embeds: [errorEmbed(t(language, 'dmTimerFailedTitle'), t(language, 'dmTimerFailedBody'))] });
            }
        }

        let session;
        try {
            session = await transactionManager.execute(ctx => {
                if (isUserInAnyActiveSession(userId)) {
                    throw new Error('ACTIVE_SESSION');
                }
                return sessionRepository.createSession(ctx, {
                    userId,
                    guildId: botGuildId(interaction),
                    channelId: dm ? dm.id : interaction.channelId,
                    duration: workMin,
                    title
                });
            });
        } catch (error) {
            if (error.message === 'ACTIVE_SESSION') {
                const payload = { embeds: [errorEmbed(t(language, 'activeSessionTitle'), t(language, 'pomodoroActiveSessionBody'))] };
                return dm ? interaction.editReply(payload) : interaction.reply({ ...payload, flags: 64 });
            }
            throw error;
        }
        const sessionId = session.id;

        const pomData = {
            cycle: 1,
            maxCycles: cycles,
            work: workMin,
            break: breakMin,
            originalTitle: title,
            type: 'work',
        };

        await transactionManager.execute(ctx => {
            sessionRepository.updatePomodoroData(ctx, session.id, pomData);
        });

        const row = new ActionRowBuilder().addComponents(
            ...(isTrialEligible({ ...session, duration: workMin, user_id: userId }) ? [buildTrialButton(session, language)] : []),
            new ButtonBuilder()
                .setCustomId(`cancel_study_${sessionId}`)
                .setLabel(t(language, 'cancelPomodoroButton'))
                .setStyle(ButtonStyle.Danger)
        );

        try {
            let messageId;
            let timerMessage = null;
            if (dm) {
                timerMessage = await dm.send({ embeds: [embed], components: [row] });
                messageId = timerMessage.id;
            } else {
                const reply = await interaction.reply({ embeds: [embed], components: [row], withResponse: true });
                messageId = reply?.resource?.message?.id;
            }
            if (messageId) {
                await transactionManager.execute(ctx => {
                    sessionRepository.updateMessageId(ctx, session.id, messageId);
                });
                session.message_id = messageId;
            }

            session.pomodoro_data = JSON.stringify(pomData);

            startStudyTimer(interaction.client, session, true);
            if (timerMessage) await postDmTimerNotice(interaction, language, workMin, timerMessage);
        } catch (err) {
            console.error('[POMODORO] Failed to reply to command, deleting ghost session:', err.message);
            await transactionManager.execute(ctx => {
                sessionRepository.cancelSession(ctx, session.id);
            });
            if (dm) {
                await interaction.editReply({ embeds: [errorEmbed(t(language, 'dmTimerFailedTitle'), t(language, 'dmTimerFailedBody'))] }).catch(() => {});
            }
        }
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const userId = interaction.user.id;
        const pastTitles = getPastSessionTitles(userId);

        const filtered = pastTitles
            .filter(title => title.toLowerCase().includes(focusedValue))
            .slice(0, 25)
            .map(t => ({ name: t, value: t }));

        if (filtered.length === 0 && focusedValue) {
            filtered.push({ name: `New: ${focusedValue}`, value: focusedValue });
        }

        await interaction.respond(filtered).catch(() => {});
    },
};
