/**
 * Market Prices — Daily price randomizer for crop selling.
 * Runs at 00:00 UTC every day and refreshes market_prices table.
 */

const { Plants } = require('./constants');
const { setMarketPrice, getRuntimeState, setRuntimeState } = require('./database');

const PRICE_DATE_KEY = 'market_prices_date';

/**
 * Generate a randomized price for an item based on its base price and variance.
 * e.g. baseSellPrice=10, priceVariance=0.40 → price between 6 and 14.
 */
function generatePrice(baseSellPrice, priceVariance) {
    const min = Math.max(1, Math.round(baseSellPrice * (1 - priceVariance)));
    const max = Math.round(baseSellPrice * (1 + priceVariance));
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Refresh all plant sell prices for today.
 * Called on bot start and every midnight via cron.
 */
function refreshMarketPrices() {
    setRuntimeState(PRICE_DATE_KEY, new Date().toISOString().slice(0, 10));
    let updated = 0;
    for (const [key, plant] of Object.entries(Plants)) {
        if (plant.baseSellPrice == null) continue;
        const price = generatePrice(plant.baseSellPrice, plant.priceVariance ?? 0.30);
        setMarketPrice(key, price);
        updated++;
    }
    console.log(`[MARKET] 📈 Refreshed daily prices for ${updated} crop(s).`);
}

/**
 * Initialize the daily price refresh cron job.
 * Runs every day at 00:00 UTC.
 */
function initMarketPriceJob() {
    // Prices change once per UTC day; a restart must not re-roll them
    const today = new Date().toISOString().slice(0, 10);
    const lastRefresh = getRuntimeState(PRICE_DATE_KEY);
    const lastDate = typeof lastRefresh === 'object' && lastRefresh !== null ? lastRefresh.value : lastRefresh;
    if (lastDate !== today) refreshMarketPrices();

    // Schedule next refresh at the next midnight UTC
    function scheduleNextMidnight() {
        const now = new Date();
        const nextMidnight = new Date(Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() + 1,  // tomorrow
            0, 0, 0, 0
        ));
        const msUntilMidnight = nextMidnight.getTime() - now.getTime();

        setTimeout(() => {
            refreshMarketPrices();
            // Then repeat every 24 hours
            setInterval(refreshMarketPrices, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);

        console.log(`[MARKET] ⏰ Next price refresh in ${Math.round(msUntilMidnight / 60000)} min (midnight UTC).`);
    }

    scheduleNextMidnight();
}

module.exports = { initMarketPriceJob, refreshMarketPrices, generatePrice };
