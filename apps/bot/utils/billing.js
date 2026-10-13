/**
 * Pomo Pro checkout through Lemon Squeezy.
 * The checkout links come from the Lemon Squeezy dashboard (Products → Share)
 * and carry the buyer's Discord id as custom data, so the webhook knows who to
 * give Pro to without any email matching.
 */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('./database');
const { t } = require('./i18n');

const PLANS = {
    monthly: { env: 'LEMONSQUEEZY_CHECKOUT_MONTHLY', price: '$2.99', labelKey: 'proBuyMonthly' },
    yearly: { env: 'LEMONSQUEEZY_CHECKOUT_YEARLY', price: '$19.99', labelKey: 'proBuyYearly' },
};
const PRICING_PAGE = 'https://pomofocus.online/support';

function checkoutUrl(plan, discordId) {
    const base = process.env[PLANS[plan]?.env];
    if (!base) return null;
    try {
        const url = new URL(base);
        if (discordId) url.searchParams.set('checkout[custom][discord_id]', String(discordId));
        return url.toString();
    } catch (_) {
        return null;
    }
}

/** Link buttons for the plans that are configured, or the pricing page. */
function buyButtons(language, discordId) {
    const buttons = Object.entries(PLANS)
        .map(([plan, info]) => {
            const url = checkoutUrl(plan, discordId);
            return url && new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel(t(language, info.labelKey, { price: info.price }))
                .setEmoji(plan === 'yearly' ? '⭐' : '🍅')
                .setURL(url);
        })
        .filter(Boolean);
    if (buttons.length) return buttons;
    return [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(t(language, 'upsellGetProButton')).setURL(PRICING_PAGE)];
}

function buyRow(language, discordId) {
    return new ActionRowBuilder().addComponents(...buyButtons(language, discordId));
}

/** Customer portal link of the user's latest Lemon Squeezy subscription, if any. */
function manageUrl(discordId) {
    return db.prepare(`
        SELECT customer_portal_url FROM billing_subscriptions
        WHERE discord_id = ? AND customer_portal_url IS NOT NULL
        ORDER BY updated_at DESC LIMIT 1
    `).get(String(discordId))?.customer_portal_url || null;
}

module.exports = { PLANS, PRICING_PAGE, checkoutUrl, buyButtons, buyRow, manageUrl };
