/**
 * Pomo Pro checkout. Payments run through Paddle on the pricing page, where the
 * buyer signs in with Discord so the webhook knows who to give Pro to. The bot
 * only links there, and only once sales are open (PRO_SALES_OPEN=true).
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./database');
const { t } = require('./i18n');

const PLANS = {
    monthly: { price: '$2.99', labelKey: 'proBuyMonthly' },
    yearly: { price: '$19.99', labelKey: 'proBuyYearly' },
};
const PRICING_PAGE = 'https://pomofocus.online/pricing';

/** True when Pro can actually be bought (Paddle is live). */
function checkoutConfigured() {
    return process.env.PRO_SALES_OPEN === 'true';
}

/** Plan buttons to the pricing page while sales are open, otherwise one link to it. */
function buyButtons(language) {
    if (!checkoutConfigured()) {
        return [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'upsellGetProButton')).setURL(PRICING_PAGE)];
    }
    return Object.entries(PLANS).map(([plan, info]) => new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel(t(language, info.labelKey, { price: info.price }))
        .setEmoji(plan === 'yearly' ? '⭐' : '🍅')
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
