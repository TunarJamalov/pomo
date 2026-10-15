/**
 * Pomo Plus / Pomo Pro checkout. Payments run on the website (Epoint), where the
 * buyer signs in with Discord so the payment can be linked to them. The bot only
 * links there, and only once sales are open (PRO_SALES_OPEN=true).
 * Prices come from utils/epoint.js; keep them in sync with apps/web/lib/billing.ts.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./database');
const { t } = require('./i18n');
const { EPOINT_PRICES } = require('./epoint');

const azn = amount => `${amount} AZN`;
const PLANS = {
    plus: { monthly: azn(EPOINT_PRICES.plus.monthly), yearly: azn(EPOINT_PRICES.plus.yearly), labelKey: 'planBuyPlus' },
    pro: { monthly: azn(EPOINT_PRICES.pro.monthly), yearly: azn(EPOINT_PRICES.pro.yearly), labelKey: 'planBuyPro' },
};
const PRICING_PAGE = 'https://pomofocus.online/pricing';
const BILLING_PAGE = 'https://pomofocus.online/billing';

/** True when a plan can actually be bought (checkout is live). */
function checkoutConfigured() {
    return process.env.PRO_SALES_OPEN === 'true';
}

/** One button per plan to the pricing page while sales are open, otherwise one link to it. */
function buyButtons(language) {
    if (!checkoutConfigured()) {
        return [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'upsellGetProButton')).setURL(PRICING_PAGE)];
    }
    return Object.entries(PLANS).map(([plan, info]) => new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(t(language, info.labelKey, { price: info.monthly }))
        .setEmoji(plan === 'pro' ? '🚀' : '⭐')
        .setURL(`${PRICING_PAGE}?plan=${plan}#pricing`));
}

function buyRow(language, discordId) {
    return new ActionRowBuilder().addComponents(...buyButtons(language, discordId));
}

/** Link to the billing page (card, renewal date, cancel) if the user has an Epoint subscription. */
function manageUrl(discordId) {
    const sub = db.prepare(`
        SELECT 1 FROM epoint_subscriptions
        WHERE discord_id = ? AND status IN ('active', 'past_due') LIMIT 1
    `).get(String(discordId));
    return sub ? BILLING_PAGE : null;
}

module.exports = { PLANS, PRICING_PAGE, BILLING_PAGE, checkoutConfigured, buyButtons, buyRow, manageUrl };
