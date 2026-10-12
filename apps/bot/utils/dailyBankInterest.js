const cron = require('node-cron');
const { db } = require('./database');

const INTEREST_RATE = 0.05; // 5%
const MAX_WATER_BONUS = 500;
const MAX_FRUIT_BONUS = 10;

function runDailyBankInterest() {
    console.log('[BANK] Starting daily clan treasury interest job...');
    let clansProcessed = 0;
    let waterGranted = 0;
    let itemsGranted = 0;

    try {
        // 1. Process Water Interest
        const clans = db.prepare('SELECT id, water FROM clans WHERE water > 0').all();
        
        const updateWaterStmt = db.prepare('UPDATE clans SET water = water + ? WHERE id = ?');
        
        for (const clan of clans) {
            const interest = Math.floor(clan.water * INTEREST_RATE);
            if (interest > 0) {
                const bonus = Math.min(interest, MAX_WATER_BONUS);
                updateWaterStmt.run(bonus, clan.id);
                waterGranted += bonus;
                clansProcessed++;
            }
        }

        // 2. Process Fruit Inventory Interest
        const inventories = db.prepare('SELECT clan_id, item_key, quantity FROM clan_inventory WHERE quantity > 0').all();
        
        const updateInventoryStmt = db.prepare('UPDATE clan_inventory SET quantity = quantity + ? WHERE clan_id = ? AND item_key = ?');
        
        for (const inv of inventories) {
            const interest = Math.floor(inv.quantity * INTEREST_RATE);
            if (interest > 0) {
                const bonus = Math.min(interest, MAX_FRUIT_BONUS);
                updateInventoryStmt.run(bonus, inv.clan_id, inv.item_key);
                itemsGranted += bonus;
            }
        }

        console.log(`[BANK] Finished daily interest! ${clansProcessed} clans got total +${waterGranted} 💧 and +${itemsGranted} items.`);
    } catch (error) {
        console.error('[BANK] Error running daily bank interest:', error.message);
    }
}

function startDailyBankInterest() {
    // Run at midnight UTC every day
    cron.schedule('0 0 * * *', () => {
        runDailyBankInterest();
    }, { timezone: 'UTC' });
    console.log('[BANK] Daily bank interest job scheduled.');
}

module.exports = {
    runDailyBankInterest,
    startDailyBankInterest,
};
