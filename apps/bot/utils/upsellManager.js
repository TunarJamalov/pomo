'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./database');
const { Colors, GardenPlotLimits } = require('./constants');
const { isProActive } = require('./premiumManager');
const { t, getInteractionLanguage } = require('./i18n');

const { buyButtons } = require('./billing');

const UPSELL_COOLDOWNS = {
  GLOBAL_HOURS:   24,
  STREAK_BREAK:   72,
  GARDEN_FULL:    48,
  PERSONA_SWITCH: 168,
  MONTHLY_CAP:    4,
};

const MAX_UPSELLS_PER_MONTH = UPSELL_COOLDOWNS.MONTHLY_CAP;

function getHoursSince(isoString) {
  return (Date.now() - new Date(isoString).getTime()) / (1000 * 60 * 60);
}

/**
 * Check cooldowns and show an upsell embed to the user.
 * Returns true if upsell was shown, false if on cooldown.
 */
async function triggerUpsell(interaction, upsellType) {
  const userId = interaction.user?.id || interaction.member?.id;
  if (!userId) return false;

  // Check user is not already pro
  if (isProActive(userId)) return false;

  // Global cooldown
  const lastAnyUpsell = db.prepare(
    'SELECT shown_at FROM upsell_log WHERE user_id = ? ORDER BY shown_at DESC LIMIT 1'
  ).get(userId);
  if (lastAnyUpsell && getHoursSince(lastAnyUpsell.shown_at) < UPSELL_COOLDOWNS.GLOBAL_HOURS) return false;

  // Type-specific cooldown
  const lastThisType = db.prepare(
    'SELECT shown_at FROM upsell_log WHERE user_id = ? AND upsell_type = ? ORDER BY shown_at DESC LIMIT 1'
  ).get(userId, upsellType);
  if (lastThisType && getHoursSince(lastThisType.shown_at) < (UPSELL_COOLDOWNS[upsellType] || 48)) return false;

  // Monthly cap
  const upsellsThisMonth = db.prepare(
    `SELECT COUNT(*) as count FROM upsell_log WHERE user_id = ? AND shown_at >= datetime('now', 'start of month')`
  ).get(userId);
  if (upsellsThisMonth.count >= MAX_UPSELLS_PER_MONTH) return false;

  // Build embed based on type
  const language = getInteractionLanguage(interaction);
  const plotVars = { freePlots: GardenPlotLimits.FREE, proPlots: GardenPlotLimits.PRO };
  const embed = new EmbedBuilder().setColor(Colors.PREMIUM);
  const buttons = new ActionRowBuilder();

  if (upsellType === 'STREAK_BREAK') {
    embed
      .setTitle(`${t(language, 'upsellStreakTitle')} 🔥`)
      .setDescription(t(language, 'upsellStreakBody', plotVars));
    buttons.addComponents(
      ...buyButtons(language, interaction.user.id),
      new ButtonBuilder().setCustomId('upsell_dismiss').setLabel(t(language, 'upsellMaybeLaterButton')).setStyle(ButtonStyle.Secondary)
    );
  } else if (upsellType === 'GARDEN_FULL') {
    embed
      .setTitle(`${t(language, 'upsellGardenTitle')} 🌱`)
      .setDescription(t(language, 'upsellGardenBody', plotVars));
    buttons.addComponents(
      ...buyButtons(language, interaction.user.id),
      new ButtonBuilder().setCustomId('upsell_dismiss').setLabel(t(language, 'upsellNotNowButton')).setStyle(ButtonStyle.Secondary)
    );
  } else if (upsellType === 'PERSONA_SWITCH') {
    embed
      .setTitle(`${t(language, 'upsellPersonaTitle')} 🎭`)
      .setDescription(t(language, 'upsellPersonaBody', plotVars));
    buttons.addComponents(
      ...buyButtons(language, interaction.user.id),
      new ButtonBuilder().setCustomId('upsell_dismiss').setLabel(t(language, 'upsellMaybeLaterButton')).setStyle(ButtonStyle.Secondary)
    );
  } else {
    // Generic upsell
    embed
      .setTitle(`${t(language, 'upsellGenericTitle')} ⭐`)
      .setDescription(t(language, 'upsellGenericBody', plotVars));
    buttons.addComponents(
      ...buyButtons(language, interaction.user.id),
      new ButtonBuilder().setCustomId('upsell_dismiss').setLabel(t(language, 'upsellMaybeLaterButton')).setStyle(ButtonStyle.Secondary)
    );
  }

  try {
    const payload = { embeds: [embed], components: [buttons], flags: 64 };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);

    // Log the upsell
    db.prepare(
      "INSERT INTO upsell_log (user_id, upsell_type, shown_at) VALUES (?, ?, datetime('now'))"
    ).run(userId, upsellType);

    return true;
  } catch (err) {
    console.warn('[UpsellManager] Could not send upsell:', err.message);
    return false;
  }
}

module.exports = { triggerUpsell };
