/**
 * Pomo Plus / Pomo Pro checkout. Payments run on the website's pricing page,
 * where the buyer signs in with Discord so the payment can be linked to them.
 * The bot only links there, and only once sales are open (PRO_SALES_OPEN=true).
 * Keep prices in sync with apps/web/lib/billing.ts.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./database');
const { t } = require('./i18n');

const PLANS = {
    plus: { monthly: '$1.49', yearly: '$11.99', labelKey: 'planBuyPlus' },
    pro: { monthly: '$1.99', yearly: '$15.99', labelKey: 'planBuyPro' },
};
const PRICING_PAGE = 'https://pomofocus.online/pricing';

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

/** Link to manage (cancel) the user's latest subscription, if Paddle gave us one. */
function manageUrl(discordId) {
    return db.prepare(`
        SELECT customer_portal_url FROM billing_subscriptions
        WHERE provider = 'paddle' AND discord_id = ? AND customer_portal_url IS NOT NULL
        ORDER BY updated_at DESC LIMIT 1
    `).get(String(discordId))?.customer_portal_url || null;
}

module.exports = { PLANS, PRICING_PAGE, checkoutConfigured, buyButtons, buyRow, manageUrl };
