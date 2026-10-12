/**
 * Event: interactionCreate
 * Routes slash commands and button interactions to their handlers.
 * Wraps execution in try/catch for graceful error handling.
 */

const { Events, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { errorEmbed, successEmbed } = require('../utils/embeds');
const { Colors } = require('../utils/constants');
const {
    getActiveSessionForUser,
    getOrCreateGuildSettings,
    updateGuildSettings,
    getCurrentGuildQuests,
    db,
    recordCommandUsage,
} = require('../utils/database');
const { cancelSession, pauseStudySession, resumeStudySession, shortenToTrialSession } = require('../utils/timerManager');
const { getInteractionLanguage, getGuildLanguage, t } = require('../utils/i18n');
const {
    handlePlantButton,
    handlePlantSelect,
    handleWaterButton,
    handleWaterSelect,
    handleHarvestButton,
    handleHarvestSelect,
} = require('../commands/garden');
const {
    handleCraftButton,
    handleEatButton,
    handleCraftSelect,
    handleEatSelect,
} = require('../commands/snack');
const { handleMarketBuy, handleMarketSell } = require('../commands/market');
const {
    handleTeamJoin,
    handleTeamStart,
    handleTeamCancel,
    handleTeamAutoLaunch,
    handleTeamPause,
    handleTeamResume,
} = require('../commands/team');
const { handleLeaderboardScope } = require('../commands/leaderboard');
const { handleAmbientSelect } = require('../commands/ambient');
const { handleHelpCategory } = require('../commands/help');
const { handleGuidePanelButton, handleGuidePanelPostButton } = require('../commands/guide');
const { handleSetDailyGoalBtn, handleDailyGoalSubmit } = require('../utils/dailyGoalHandler');
const { handlePersonaSelect } = require('../commands/persona');
const { handleVerificationModalSubmit, handleOwnerApprove, handleOwnerReject } = require('../utils/premiumVerification');
const { handlePlanJoin, handlePlanLeave, handlePlanLaunch } = require('../commands/plan');
const { handleTransferButton } = require('../commands/send');
const {
    handleBuddyLike,
    handleBuddyPass,
    handleBuddyBlock,
    handleBuddyUnmatch,
    handleBuddyReportButton,
    handleBuddyReportSubmit,
    handleBuddyDestination,
    handleBuddyHubConsent,
} = require('../commands/findbuddy');
const {
    maybeSendSetupNudge,
    handleSetupWizardOpen,
    handleSetupWizardChannel,
} = require('../utils/setupWizard');
const { maybeSendUserOnboardingTip } = require('../utils/userOnboarding');
const { botGuildId } = require('../utils/interactionContext');
const { findWelcomeChannel } = require('./guildCreate');

// In-memory cooldown tracking
const cooldowns = new Map();

module.exports = {
    name: Events.InteractionCreate,
    once: false,
    async execute(interaction) {
        // ─── Handle Button Interactions ──────────────────────
        if (interaction.isButton()) {
            return handleButton(interaction);
        }

        // ─── Handle Modal Submissions ────────────────────────
        if (interaction.isModalSubmit()) {
            return handleModalSubmit(interaction);
        }

        if (interaction.isChannelSelectMenu()) {
            return handleChannelSelectMenu(interaction);
        }

        // ─── Handle Select Menu Interactions ─────────────────
        if (interaction.isStringSelectMenu()) {
            return handleSelectMenu(interaction);
        }

        // ─── Handle Autocomplete Interactions ────────────────
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command || !command.autocomplete) return;
            try {
                await command.autocomplete(interaction);
            } catch (error) {
                // 10062: the user kept typing and Discord dropped this request; nothing to fix.
                if (error?.code === 10062 || error?.code === 40060) return;
                console.error(`[AC] Autocomplete error for /${interaction.commandName}:`, error);
            }
            return;
        }

        // ─── Handle Slash Commands ───────────────────────────
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
            console.warn(`[CMD] Unknown command: ${interaction.commandName}`);
            const language = getInteractionLanguage(interaction);
            return interaction.reply({
                embeds: [errorEmbed(
                    t(language, 'interactionCommandUnavailableTitle'),
                    t(language, 'interactionCommandUnavailableBody')
                )],
                flags: 64,
            }).catch(() => {});
        }

        // ─── Cooldown Check ─────────────────────────────────
        const cooldownAmount = (command.cooldown || 3) * 1000;
        const now = Date.now();

        if (!cooldowns.has(command.data.name)) {
            cooldowns.set(command.data.name, new Map());
        }

        const timestamps = cooldowns.get(command.data.name);
        const userId = interaction.user.id;

        if (timestamps.has(userId)) {
            const expirationTime = timestamps.get(userId) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = ((expirationTime - now) / 1000).toFixed(1);
                const language = getInteractionLanguage(interaction);
                return interaction.reply({
                    embeds: [errorEmbed(
                        t(language, 'interactionCooldownTitle'),
                        t(language, 'interactionCooldownBody', { seconds: timeLeft, command: command.data.name })
                    )],
                    flags: 64,
                });
            }
        }

        timestamps.set(userId, now);
        setTimeout(() => timestamps.delete(userId), cooldownAmount);

        // ─── Execute Command ────────────────────────────────
        try {
            // Build full command string with arguments for logging
            let fullCommand = `/${interaction.commandName}`;
            
            const subCommandGroup = interaction.options.getSubcommandGroup(false);
            if (subCommandGroup) fullCommand += ` ${subCommandGroup}`;
            
            const subCommand = interaction.options.getSubcommand(false);
            if (subCommand) fullCommand += ` ${subCommand}`;
            
            const options = interaction.options.data.map(opt => {
                // If the option is a subcommand, its options are nested
                if (opt.type === 1 || opt.type === 2) {
                    return opt.options ? opt.options.map(o => `${o.name}:${o.value}`).join(' ') : '';
                }
                return `${opt.name}:${opt.value}`;
            }).filter(Boolean).join(' ');

            if (options) fullCommand += ` ${options}`;

            await command.execute(interaction);
            try {
                recordCommandUsage(
                    botGuildId(interaction),
                    interaction.user.id,
                    interaction.commandName,
                    subCommand,
                );
            } catch (usageError) {
                console.error('[ANALYTICS] Failed to record command usage:', usageError.message);
            }
            logCommand(interaction, fullCommand.trim());
            try {
                await maybeSendSetupNudge(interaction);
            } catch (nudgeError) {
                console.error('[SETUP] Failed to send admin nudge:', nudgeError.message);
            }
            try {
                await maybeSendUserOnboardingTip(interaction);
            } catch (onboardingError) {
                console.error('[ONBOARDING] Failed to send user tip:', onboardingError.message);
            }
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error executing /${interaction.commandName}:`, error);

            const language = getInteractionLanguage(interaction);
            const embed = errorEmbed(
                t(language, 'interactionCommandErrorTitle'),
                t(language, 'interactionCommandErrorBody')
            );

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ embeds: [embed], flags: 64 });
                } else {
                    await interaction.reply({ embeds: [embed], flags: 64 });
                }
            } catch (replyError) {
                // 10062 = expired/unknown interaction token (Discord dropped it or
                // the 15-min window passed). Nothing more can be sent, keep it a one-liner.
                if (replyError?.code === 10062) {
                    console.warn(`[WARN] Could not send error reply for /${interaction.commandName}: interaction expired (10062).`);
                } else {
                    console.error('[ERR] Failed to send error response:', replyError);
                }
            }
        }
    },
};

/**
 * Handle button interactions.
 */
// routeButton returns handler promises without awaiting them, and a returned
// (not awaited) promise skips the try/catch inside it. Awaiting it here makes
// sure every button failure reaches one handler.
async function handleButton(interaction) {
    try {
        return await routeButton(interaction);
    } catch (error) {
        if (error?.code === 10062) {
            console.warn(`[BTN] ${interaction.customId}: interaction expired before Pomo replied (10062).`);
            return null;
        }
        console.error('[BTN] Button handler error:', error);
        const language = getInteractionLanguage(interaction);
        const payload = {
            embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionButtonErrorBody'))],
            flags: 64,
        };
        const send = interaction.replied || interaction.deferred ? interaction.followUp(payload) : interaction.reply(payload);
        return send.catch(() => null);
    }
}

async function routeButton(interaction) {
    {
        let customId = interaction.customId;
        let setupGuildId = null;

        if (customId.startsWith('setup_auto_')) {
            setupGuildId = customId.split('_')[2];
            customId = 'setup_auto';
        }
        if (customId.startsWith('setup_quick_')) {
            setupGuildId = customId.split('_')[2];
            customId = 'setup_quick';
        }
        if (customId.startsWith('setup_wizard_open_')) {
            setupGuildId = customId.split('_')[3];
            customId = 'setup_wizard_open';
        }

        
        if (customId.startsWith('fb_reply_')) {
            return await require('../utils/feedbackReplies').handleOwnerReplyButton(interaction);
        }
        if (customId === 'fb_user_reply') {
            return await require('../utils/feedbackReplies').handleUserReplyButton(interaction);
        }

        if (customId.startsWith('habit_tick_')) {
            return await require('../commands/habit').handleHabitButton(interaction);
        }

        if (customId === 'set_daily_goal') {
            return await handleSetDailyGoalBtn(interaction);
        }

        
        
        if (customId.startsWith('pro_approve_')) {
            const targetUserId = customId.replace('pro_approve_', '');
            return await handleOwnerApprove(interaction, targetUserId);
        }

        if (customId.startsWith('pro_reject_')) {
            const targetUserId = customId.replace('pro_reject_', '');
            return await handleOwnerReject(interaction, targetUserId);
        }

        if (customId === 'upsell_dismiss') {
            const { db } = require('../utils/database');
            db.prepare('UPDATE upsell_log SET was_clicked = 1 WHERE user_id = ? AND was_clicked = 0').run(interaction.user.id);
            return interaction.update({ components: [] }).catch(() => {});
        }

        if (customId === 'setup_auto') {
            return await handleAutoSetup(interaction, setupGuildId);
        }

        if (customId === 'setup_quick') {
            return await handleQuickSetup(interaction, setupGuildId);
        }

        if (customId === 'setup_wizard_open') {
            return await handleSetupWizardOpen(interaction, setupGuildId);
        }

        if (customId === 'guide_post_panel') {
            return await handleGuidePanelPostButton(interaction);
        }

        if (customId.startsWith('guide_panel_')) {
            return await handleGuidePanelButton(interaction);
        }

        if (customId.startsWith('trial_study_')) {
            const sessionId = parseInt(customId.split('_')[2], 10);
            const language = getInteractionLanguage(interaction);
            const result = await shortenToTrialSession(interaction.client, sessionId, interaction.user.id);
            return interaction.reply({
                content: result.ok
                    ? t(language, 'trialSwitchedBody', { time: `<t:${Math.floor(result.endsAt.getTime() / 1000)}:R>` })
                    : t(language, 'trialNotAvailableBody'),
                flags: 64,
            });
        }

        if (customId.startsWith('pause_study_') || customId.startsWith('resume_study_')) {
            const sessionId = parseInt(customId.split('_')[2], 10);
            const session = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId);
            const language = getInteractionLanguage(interaction);

            if (!session || session.completed === 1) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'noActiveSessionTitle'), t(language, 'noActiveSessionBody'))],
                    flags: 64,
                });
            }

            if (session.user_id !== interaction.user.id) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'notYourSessionTitle'), t(language, 'notYourSessionBody'))],
                    flags: 64,
                });
            }

            const isPause = customId.startsWith('pause_study_');
            const result = isPause
                ? await pauseStudySession(interaction.client, session)
                : await resumeStudySession(interaction.client, session);

            if (!result.ok) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, pauseButtonTitleKey(result.reason)), t(language, pauseButtonBodyKey(result.reason)))],
                    flags: 64,
                });
            }

            return interaction.reply({
                embeds: [successEmbed(
                    isPause ? t(language, 'sessionPausedTitle') : t(language, 'sessionResumedTitle'),
                    isPause ? t(language, 'sessionPausedBody', { minutes: 15 }) : t(language, 'sessionResumedBody')
                )],
                flags: 64,
            });
        }

        // ─── Buddy Like / Pass / Block ───────────────────────
        if (customId.startsWith('buddy_like_')) {
            const parts = customId.split('_');
            const candReqId = parseInt(parts[2], 10);
            const myReqId = parseInt(parts[3], 10);
            if (Number.isNaN(candReqId) || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, true);
            }
            return await handleBuddyLike(interaction, candReqId, myReqId);
        }

        if (customId.startsWith('buddy_pass_')) {
            const parts = customId.split('_');
            const candReqId = parseInt(parts[2], 10);
            const myReqId = parseInt(parts[3], 10);
            if (Number.isNaN(candReqId) || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, true);
            }
            return await handleBuddyPass(interaction, candReqId, myReqId);
        }

        if (customId.startsWith('buddy_blockreq_')) {
            const parts = customId.split('_');
            const candReqId = parseInt(parts[2], 10);
            const myReqId = parseInt(parts[3], 10);
            if (Number.isNaN(candReqId) || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            return await handleBuddyBlock(interaction, candReqId, myReqId);
        }

        if (customId.startsWith('buddy_block_')) {
            const parts = customId.split('_');
            const targetUserId = parts[2];
            const myReqId = parseInt(parts[3], 10);
            if (!targetUserId || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            const legacyReq = require("../utils/database").pomomatchRepository.getLatestWaitingBuddyRequestForUser(targetUserId);
            if (!legacyReq) {
                return replyInvalidAction(interaction, true);
            }
            return await handleBuddyBlock(interaction, legacyReq.id, myReqId);
        }

        // ─── Buddy Unmatch / Report ──────────────────────────
        if (customId.startsWith('buddy_unmatch_')) {
            const myReqId = parseInt(customId.split('_')[2], 10);
            if (Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            return await handleBuddyUnmatch(interaction, myReqId);
        }

        if (customId.startsWith('buddy_report_') && !customId.startsWith('buddy_report_modal_')) {
            const parts = customId.split('_');
            const myReqId = parseInt(parts[parts.length - 1], 10);
            const partnerId = parts.slice(2, -1).join('_');
            if (!partnerId || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            return await handleBuddyReportButton(interaction, partnerId, myReqId);
        }

        // ─── Buddy Destination ───────────────────────────────
        // Choice values contain underscores (own_server, study_hub), so the
        // request id is parsed from the trailing numeric segment.
        if (customId.startsWith('buddy_dest_')) {
            const parts = customId.split('_');
            const myReqId = parseInt(parts[parts.length - 1], 10);
            const choice = parts.slice(2, -1).join('_');
            if (!choice || Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            return await handleBuddyDestination(interaction, choice, myReqId);
        }

        // ─── Buddy Hub Consent ───────────────────────────────
        // buddy_hub_accept_<reqId> / buddy_hub_decline_<reqId>
        if (customId.startsWith('buddy_hub_accept_') || customId.startsWith('buddy_hub_decline_')) {
            const decision = customId.startsWith('buddy_hub_accept_') ? 'accept' : 'decline';
            const prefixLen = decision === 'accept' ? 'buddy_hub_accept_'.length : 'buddy_hub_decline_'.length;
            const myReqId = parseInt(customId.slice(prefixLen), 10);
            if (Number.isNaN(myReqId)) {
                return replyInvalidAction(interaction, false);
            }
            return await handleBuddyHubConsent(interaction, decision, myReqId);
        }

        // ─── Buddy Cancel ────────────────────────────────────
        if (customId.startsWith('buddy_cancel_')) {
            const reqId = parseInt(customId.split('_')[2]);
            const result = require('../utils/database').pomomatchRepository.cancelWaitingBuddyRequest(reqId, interaction.user.id);
            const language = getInteractionLanguage(interaction);
            if (result.changes > 0) {
                return interaction.reply({
                    embeds: [successEmbed(t(language, 'interactionBuddyRequestCancelledTitle'), t(language, 'interactionBuddyRequestCancelledBody'))],
                    flags: 64,
                });
            }
            return interaction.reply({
                embeds: [errorEmbed(t(language, 'notFoundTitle'), t(language, 'interactionBuddyRequestNotFoundBody'))],
                flags: 64,
            });
        }

        // ─── Cancel Study / Break ────────────────────────────
        if (customId === 'cancel_study' || customId === 'cancel_break' ||
            customId.startsWith('cancel_study_') || customId.startsWith('cancel_break_')) {
            const currentUserId = interaction.user.id;

            // Determine target session: prefer ID-embedded format for security
            let session;
            const idMatch = customId.match(/^cancel_(?:study|break)_(\d+)$/);
            if (idMatch) {
                const sessionId = parseInt(idMatch[1]);
                session = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sessionId);
            } else {
                // Legacy fallback: find the session of whoever clicked
                session = getActiveSessionForUser(currentUserId);
            }

            const language = getInteractionLanguage(interaction);

            if (!session || session.completed === 1) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'interactionNoSessionTitle'), t(language, 'interactionNoSessionBody'))],
                    flags: 64,
                });
            }

            // Only the session owner can cancel
            if (session.user_id !== currentUserId) {
                return interaction.reply({
                    embeds: [errorEmbed(t(language, 'interactionNotYoursTitle'), t(language, 'interactionNotYoursBody'))],
                    flags: 64,
                });
            }

            cancelSession(session.id);

            const isStudy = customId.startsWith('cancel_study');
            const embed = new EmbedBuilder()
                .setColor(Colors.WARNING)
                .setTitle(`⏹️ ${t(language, isStudy ? 'interactionStudyCancelledTitle' : 'interactionBreakCancelledTitle')}`)
                .setDescription(t(language, isStudy ? 'interactionStudyCancelledBody' : 'interactionBreakCancelledBody'))
                .setTimestamp();

            // Update the original message
            await interaction.update({ embeds: [embed], components: [] });
            return;
        }

        // ─── Garden Buttons ──────────────────────────────────
        if (customId === 'garden_plant') return await handlePlantButton(interaction);
        if (customId === 'garden_water') return await handleWaterButton(interaction);
        if (customId === 'garden_harvest') return await handleHarvestButton(interaction);

        // ─── Snack Buttons ───────────────────────────────────
        if (customId === 'snack_craft') return await handleCraftButton(interaction);
        if (customId === 'snack_eat') return await handleEatButton(interaction);

        // ─── Team Buttons ────────────────────────────────────
        if (customId.startsWith('team_join_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamJoin(interaction, sessionId);
        }
        if (customId.startsWith('team_start_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamStart(interaction, sessionId);
        }
        if (customId.startsWith('team_cancel_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamCancel(interaction, sessionId);
        }
        if (customId.startsWith('team_pause_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamPause(interaction, sessionId);
        }
        if (customId.startsWith('team_resume_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamResume(interaction, sessionId);
        }
        if (customId.startsWith('team_autolaunch_')) {
            const sessionId = parseInt(customId.split('_')[2]);
            return await handleTeamAutoLaunch(interaction, sessionId);
        }

        // ─── Plan Buttons ────────────────────────────────────
        if (customId.startsWith('plan_join_')) {
            const planId = parseInt(customId.split('_')[2]);
            return await handlePlanJoin(interaction, planId);
        }
        if (customId.startsWith('plan_leave_')) {
            const planId = parseInt(customId.split('_')[2]);
            return await handlePlanLeave(interaction, planId);
        }
        if (customId.startsWith('plan_launch_')) {
            const planId = parseInt(customId.split('_')[2]);
            return await handlePlanLaunch(interaction, planId);
        }

        // ─── Water Transfer Approval/Rejection ──────────────────────
        if (customId.startsWith('transfer_approve_') || customId.startsWith('transfer_reject_')) {
            return await handleTransferButton(interaction);
        }

    }
}

function replyInvalidAction(interaction, suggestFindBuddy) {
    const language = getInteractionLanguage(interaction);
    return interaction.reply({
        embeds: [errorEmbed(
            t(language, 'interactionInvalidActionTitle'),
            t(language, suggestFindBuddy ? 'interactionButtonExpiredFindBuddyBody' : 'interactionButtonExpiredBody')
        )],
        flags: 64,
    });
}

function pauseButtonTitleKey(reason) {
    if (reason === 'break' || reason === 'pomodoro') return 'pauseUnsupportedTitle';
    if (reason === 'timeout') return 'sessionAutoCancelledTitle';
    return 'sessionPauseErrorTitle';
}

function pauseButtonBodyKey(reason) {
    const map = {
        break: 'pauseBreakUnsupportedBody',
        pomodoro: 'pausePomodoroUnsupportedBody',
        already_paused: 'alreadyPausedBody',
        not_paused: 'notPausedBody',
        limit: 'pauseLimitReachedBody',
        timeout: 'pauseTimeoutCancelledBody',
        not_found: 'noActiveSessionBody',
    };
    return map[reason] || 'sessionPauseErrorBody';
}

async function handleChannelSelectMenu(interaction) {
    try {
        if (
            interaction.customId === 'setup_wizard_voice'
            || interaction.customId === 'setup_wizard_report'
        ) {
            return await handleSetupWizardChannel(interaction);
        }
    } catch (error) {
        console.error('[CHANNEL SELECT] Handler error:', error);
        try {
            const language = getInteractionLanguage(interaction);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionChannelSelectErrorBody'))],
                    flags: 64,
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionChannelSelectErrorBody'))],
                    flags: 64,
                });
            }
        } catch (_) {}
    }
}

/**
 * Handle modal submissions.
 */
async function handleModalSubmit(interaction) {
    try {
        
        if (interaction.customId === 'pro_verification_modal') {
            return await handleVerificationModalSubmit(interaction);
        }

        if (interaction.customId?.startsWith('fb_reply_modal_')) {
            return await require('../utils/feedbackReplies').handleOwnerReplyModal(interaction);
        }
        if (interaction.customId === 'fb_user_modal') {
            return await require('../utils/feedbackReplies').handleUserReplyModal(interaction);
        }

        if (interaction.customId === 'daily_goal_modal') {
            return await handleDailyGoalSubmit(interaction);
        }

        if (interaction.customId && interaction.customId.startsWith('buddy_report_modal_')) {
            return await handleBuddyReportSubmit(interaction);
        }
    } catch (error) {
        console.error('[MODAL] Handler error:', error);
        try {
            const language = getInteractionLanguage(interaction);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionFormErrorBody'))],
                    flags: 64,
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionFormErrorBody'))],
                    flags: 64,
                });
            }
        } catch (_) {}
    }
}

/**
 * Handle select menu interactions.
 */
async function handleSelectMenu(interaction) {
    try {
        const customId = interaction.customId;

        // ─── Garden Select Menus ─────────────────────────────
        if (customId === 'garden_select_plant') return await handlePlantSelect(interaction);
        if (customId === 'garden_select_water') return await handleWaterSelect(interaction);
        if (customId === 'garden_select_harvest') return await handleHarvestSelect(interaction);

        // ─── Snack Select Menus ──────────────────────────────
        if (customId === 'snack_select_craft') return await handleCraftSelect(interaction);
        if (customId === 'snack_select_eat') return await handleEatSelect(interaction);

        // ─── Market Select Menus ─────────────────────────────────
        if (customId === 'market_buy') return await handleMarketBuy(interaction);
        if (customId === 'market_sell') return await handleMarketSell(interaction);

        // ─── Leaderboard Select Menu ─────────────────────────────
        if (customId === 'leaderboard_scope') return await handleLeaderboardScope(interaction);

        // Future select menu handlers will be added here
        // ─── Ambient Select Menu ────────────────────────────────
        if (customId === 'ambient_select') return await handleAmbientSelect(interaction);

        // ─── Help Select Menu ───────────────────────────
        if (customId === 'help_category') return await handleHelpCategory(interaction);

        // ─── Persona Select Menu ─────────────────────────
        if (customId === 'persona_select') return await handlePersonaSelect(interaction);

    } catch (error) {
        console.error('[SELECT] Select menu handler error:', error);
        try {
            const language = getInteractionLanguage(interaction);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionSelectErrorBody'))],
                    flags: 64,
                });
            } else {
                await interaction.reply({
                    embeds: [errorEmbed(t(language, 'interactionErrorTitle'), t(language, 'interactionSelectErrorBody'))],
                    flags: 64,
                });
            }
        } catch (e) {
            // Silently ignore
        }
    }
}

/**
 * Log command usage to the support server log channel.
 * Runs silently — never throws or blocks command execution.
 */
async function logCommand(interaction, actionLabel) {
    const logChannelId = process.env.LOG_CHANNEL_ID;
    if (!logChannelId) return;

    try {
        const channel = await interaction.client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) return;

        const guildName = interaction.guild?.name
            || (interaction.guildId ? 'User install (bot not in server)' : interaction.context === 2 ? 'Group DM' : 'DM');
        const channelName = interaction.channel?.name || 'Unknown';

        const embed = new EmbedBuilder()
            .setColor(0x2F3136)
            .setAuthor({
                name: interaction.user.tag,
                iconURL: interaction.user.displayAvatarURL({ size: 32 }),
            })
            .setDescription(
                `**Command:** \`${actionLabel}\`\n` +
                `**Server:** ${guildName}\n` +
                `**Channel:** ${channelName !== 'Unknown' ? `#${channelName}` : 'Unknown'}`
            )
            .setTimestamp()
            .setFooter({ text: `User ID: ${interaction.user.id}` });

        await channel.send({ embeds: [embed] }).catch(() => { });
    } catch (err) {
        // Silently ignore — logging should never break commands
    }
}

// Guilds with a 1-Click Setup currently running (a double click used to create
// every channel and role twice)
const autoSetupInProgress = new Set();

// 1-Click Setup can be clicked from the setup DM, so prefer the language of the
// server being configured over the DM locale.
function getAutoSetupLanguage(interaction, setupGuildId) {
    if (!interaction.guildId && setupGuildId) {
        return getGuildLanguage(setupGuildId, getInteractionLanguage(interaction));
    }
    return getInteractionLanguage(interaction);
}

async function handleAutoSetup(interaction, setupGuildId = null) {
    const guildId = interaction.guildId || setupGuildId;
    if (guildId && autoSetupInProgress.has(guildId)) {
        const language = getAutoSetupLanguage(interaction, setupGuildId);
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'interactionSetupInProgressTitle'), t(language, 'interactionSetupInProgressBody'))],
            flags: 64,
        });
    }
    if (guildId) autoSetupInProgress.add(guildId);
    try {
        return await runAutoSetup(interaction, setupGuildId);
    } finally {
        if (guildId) autoSetupInProgress.delete(guildId);
    }
}

/**
 * Resolves the server being set up (the button may be clicked from a DM) and
 * checks that the clicker can manage it. Returns { guild } or { error } with a
 * ready-to-send payload. The interaction must already be deferred.
 */
async function resolveSetupGuild(interaction, setupGuildId, language) {
    let guild = interaction.guild;
    if (!guild && setupGuildId) {
        guild = interaction.client.guilds.cache.get(setupGuildId) || await interaction.client.guilds.fetch(setupGuildId).catch(() => null);
    }
    if (!guild) {
        return { error: { content: `❌ ${t(language, 'interactionSetupGuildNotFound')}` } };
    }

    if (!interaction.guild) {
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member || !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            return { error: { embeds: [errorEmbed(t(language, 'interactionPermissionDeniedTitle'), t(language, 'interactionSetupManageServerDmBody'))] } };
        }
    } else if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return { error: { embeds: [errorEmbed(t(language, 'interactionPermissionDeniedTitle'), t(language, 'interactionSetupManageServerBody'))] } };
    }
    return { guild };
}

// A weekly goal a server of this size can realistically reach
function suggestedGoalMinutes(memberCount = 0) {
    if (memberCount <= 20) return 300;
    if (memberCount <= 100) return 1000;
    return 2500;
}

async function handleQuickSetup(interaction, setupGuildId = null) {
    const guildId = interaction.guildId || setupGuildId;
    if (guildId && autoSetupInProgress.has(guildId)) {
        const language = getAutoSetupLanguage(interaction, setupGuildId);
        return interaction.reply({
            embeds: [errorEmbed(t(language, 'interactionSetupInProgressTitle'), t(language, 'interactionSetupInProgressBody'))],
            flags: 64,
        });
    }
    if (guildId) autoSetupInProgress.add(guildId);
    try {
        return await runQuickSetup(interaction, setupGuildId);
    } finally {
        if (guildId) autoSetupInProgress.delete(guildId);
    }
}

/**
 * Quick Setup turns on voice tracking, weekly reports and a weekly goal using
 * the channels the server already has. Nothing is created, which suits the
 * small friend servers that make up most installs.
 */
async function runQuickSetup(interaction, setupGuildId = null) {
    const language = getAutoSetupLanguage(interaction, setupGuildId);
    await interaction.deferReply({ flags: 64 });

    const { guild, error } = await resolveSetupGuild(interaction, setupGuildId, language);
    if (error) return interaction.editReply(error);

    const settings = getOrCreateGuildSettings(guild.id);
    if (settings.setup_completed_at) {
        return interaction.editReply({
            embeds: [successEmbed(
                `✅ ${t(language, 'interactionSetupAlreadyCompleteTitle')}`,
                t(language, 'interactionSetupAlreadyCompleteBody'),
            )],
        });
    }

    // Reports go where the button was pressed; from a DM, to the server's main channel
    const me = guild.members.me;
    const canPost = channel => channel?.isTextBased?.() && !channel.isDMBased?.()
        && channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    const reportChannel = canPost(interaction.channel) ? interaction.channel : findWelcomeChannel(guild);
    if (!reportChannel) {
        return interaction.editReply({
            embeds: [errorEmbed(t(language, 'interactionSetupFailedTitle'), t(language, 'quickSetupNoChannelBody'))],
        });
    }

    const goalMinutes = suggestedGoalMinutes(guild.memberCount);
    updateGuildSettings(guild.id, {
        guild_name: guild.name,
        voice_tracking_enabled: 1,
        voice_target_id: null,
        voice_target_type: 'all',
        voice_rewards_enabled: 1,
        voice_min_minutes: 10,
        voice_daily_reward_cap: 240,
        report_enabled: 1,
        report_channel_id: reportChannel.id,
        goal_enabled: 1,
        goal_target_minutes: goalMinutes,
        goal_channel_id: reportChannel.id,
        setup_completed_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    getCurrentGuildQuests(guild.id);

    return interaction.editReply({
        embeds: [successEmbed(
            `⚡ ${t(language, 'quickSetupDoneTitle')}`,
            t(language, 'quickSetupDoneBody', { channel: `<#${reportChannel.id}>`, minutes: goalMinutes }),
        )],
    });
}

async function runAutoSetup(interaction, setupGuildId = null) {
    const language = getAutoSetupLanguage(interaction, setupGuildId);
    // Acknowledge first: the guild/member fetches below can take longer than
    // Discord's 3 second window, which used to fail with "Unknown interaction".
    await interaction.deferReply({ flags: 64 });
    const { guild, error } = await resolveSetupGuild(interaction, setupGuildId, language);
    if (error) return interaction.editReply(error);
    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions.has([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles])) {
        return interaction.editReply({
            embeds: [errorEmbed(
                t(language, 'interactionBotPermissionsMissingTitle'),
                t(language, 'interactionBotPermissionsMissingBody'),
            )],
        });
    }

    let category = null;
    let reportChannel = null;
    let role = null;
    const studyChannels = [];

    try {
        const existingSettings = getOrCreateGuildSettings(guild.id);
        if (existingSettings.setup_completed_at) {
            return interaction.editReply({
                embeds: [successEmbed(
                    `✅ ${t(language, 'interactionSetupAlreadyCompleteTitle')}`,
                    t(language, 'interactionSetupAlreadyCompleteBody'),
                )],
            });
        }

        // 1. Create Category
        category = await guild.channels.create({
            name: '📚 POMO STUDY ROOMS',
            type: ChannelType.GuildCategory,
        });

        // 2. Create text channel
        reportChannel = await guild.channels.create({
            name: 'pomo-reports',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: 'Weekly study reports and updates from PomoBot',
        });

        // 3. Create Voice Channels & Join-To-Create Channel
        const triggerChannel = await guild.channels.create({
            name: '➕ join-to-create-room',
            type: ChannelType.GuildVoice,
            parent: category.id,
            userLimit: 1, // small visual limit
        });
        studyChannels.push(triggerChannel);
        studyChannels.push(await guild.channels.create({ name: '🎧 Public Study', type: ChannelType.GuildVoice, parent: category.id }));
        studyChannels.push(await guild.channels.create({ name: '☕ Silent Study', type: ChannelType.GuildVoice, parent: category.id }));

        // 4. Create Role (Optional but requested)
        role = await guild.roles.create({
            name: 'Pomo Focus',
            colors: { primaryColor: Colors.STUDY },
            reason: 'Created by PomoBot 1-Click Setup',
        });

        // 5. Save to database
        db.prepare(`
            INSERT INTO guild_settings (
                guild_id, guild_name, voice_tracking_enabled, voice_target_id, voice_target_type,
                voice_rewards_enabled, voice_min_minutes, voice_daily_reward_cap,
                report_enabled, report_channel_id, goal_enabled, goal_target_minutes,
                goal_channel_id, setup_completed_at, studyroom_category_id, studyroom_trigger_id
            )
            VALUES (?, ?, 1, ?, 'category', 1, 10, 240, 1, ?, 1, 2500, ?, CURRENT_TIMESTAMP, ?, ?)
            ON CONFLICT(guild_id) DO UPDATE SET
                guild_name = excluded.guild_name,
                voice_tracking_enabled = 1,
                voice_target_id = excluded.voice_target_id,
                voice_target_type = excluded.voice_target_type,
                voice_rewards_enabled = 1,
                voice_min_minutes = 10,
                voice_daily_reward_cap = 240,
                report_enabled = 1,
                report_channel_id = excluded.report_channel_id,
                goal_enabled = 1,
                goal_target_minutes = 2500,
                goal_channel_id = excluded.goal_channel_id,
                setup_completed_at = excluded.setup_completed_at,
                studyroom_category_id = excluded.studyroom_category_id,
                studyroom_trigger_id = excluded.studyroom_trigger_id
        `).run(guild.id, guild.name, category.id, reportChannel.id, reportChannel.id, category.id, triggerChannel.id);

        // Create the first weekly quest set immediately so setup exposes a
        // shared objective right away.
        getCurrentGuildQuests(guild.id);

        const embed = successEmbed(
            `🚀 ${t(language, 'interactionSetupCompleteTitle')}`,
            t(language, 'interactionSetupCompleteBody', {
                category: '📚 POMO STUDY ROOMS',
                reportChannel: `<#${reportChannel.id}>`,
                role: `<@&${role.id}>`,
            })
        );

        return interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('1-Click Setup Error:', error);
        await role?.delete().catch(() => {});
        for (const channel of [...studyChannels].reverse()) await channel.delete().catch(() => {});
        await reportChannel?.delete().catch(() => {});
        await category?.delete().catch(() => {});
        const message = error?.code === 50013
            ? t(language, 'interactionSetupMissingPermissionsBody')
            : t(language, 'interactionSetupFailedBody');
        return interaction.editReply({
            embeds: [errorEmbed(t(language, 'interactionSetupFailedTitle'), message)],
        });
    }
}
