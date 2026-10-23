/**
 * 7-day Pomo Pro trial: no card, once per Discord account. It is offered only
 * while sales are open, so a trial never ends with nowhere to pay. Trials are
 * normal Pro grants with source 'trial'; premium_events keeps every grant, which
 * is how "once per account" survives the entitlement expiring.
 */
const { ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { db } = require('./database');
const { grantProAccess, isProActive } = require('./premiumManager');
const { checkoutConfigured } = require('./billing');
const { Colors, PlanEmojis } = require('./constants');
const { t, getInteractionLanguage } = require('./i18n');

const PRO_TRIAL_DAYS = 7;
const PRO_TRIAL_SOURCE = 'trial';
const PRO_TRIAL_BUTTON_ID = 'pro_trial_start';

function hasUsedProTrial(userId) {
    return !!db.prepare(`
        SELECT 1 FROM premium_events WHERE user_id = ? AND source = ? LIMIT 1
    `).get(String(userId), PRO_TRIAL_SOURCE);
}

/** Why the trial can't start for this user, or null when it can. */
function proTrialBlocker(userId) {
    if (!checkoutConfigured()) return 'closed';
    if (isProActive(userId)) return 'active';
    if (hasUsedProTrial(userId)) return 'used';
    return null;
}

function isProTrialAvailable(userId) {
    return proTrialBlocker(userId) === null;
}

/** Starts the trial. Returns { ok: true, entitlement } or { ok: false, reason }. */
function startProTrial(userId) {
    return db.transaction(() => {
        const reason = proTrialBlocker(userId);
        if (reason) return { ok: false, reason };
        const entitlement = grantProAccess(String(userId), PRO_TRIAL_DAYS, 'TRIAL', {
            source: PRO_TRIAL_SOURCE,
            planKey: 'pro',
            note: `${PRO_TRIAL_DAYS}-day trial`,
        });
        return { ok: true, entitlement };
    })();
}

function proTrialButton(language) {
    return new ButtonBuilder()
        .setCustomId(PRO_TRIAL_BUTTON_ID)
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎁')
        .setLabel(t(language, 'proTrialButton', { days: PRO_TRIAL_DAYS }));
}

const BLOCKED_KEYS = {
    closed: 'proTrialClosed',
    active: 'proTrialAlreadyActive',
    used: 'proTrialUsed',
};

async function handleProTrialButton(interaction) {
    const language = getInteractionLanguage(interaction);
    const result = startProTrial(interaction.user.id);

    if (!result.ok) {
        return interaction.reply({ content: t(language, BLOCKED_KEYS[result.reason]), flags: 64 });
    }

    const endsAt = Math.floor(new Date(`${result.entitlement.expires_at.replace(' ', 'T')}Z`).getTime() / 1000);
    const embed = new EmbedBuilder()
        .setColor(Colors.PREMIUM)
        .setTitle(t(language, 'proTrialStartedTitle'))
        .setDescription(`${PlanEmojis.pro} ${t(language, 'proTrialStartedBody', { days: PRO_TRIAL_DAYS, ends: `<t:${endsAt}:F>` })}`);
    console.log(`[ProTrial] ${interaction.user.id} started a ${PRO_TRIAL_DAYS}-day trial`);
    return interaction.reply({ embeds: [embed], flags: 64 });
}

module.exports = {
    PRO_TRIAL_DAYS,
    PRO_TRIAL_SOURCE,
    PRO_TRIAL_BUTTON_ID,
    hasUsedProTrial,
    isProTrialAvailable,
    startProTrial,
    proTrialButton,
    handleProTrialButton,
};
