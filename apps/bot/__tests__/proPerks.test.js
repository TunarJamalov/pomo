/**
 * Pomo Pro perks behave the way /premium perks describes them.
 */
const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { grantProAccess, consumeProStreakShield } = require('../utils/premiumManager');
const { applyWaterDoubler } = require('../utils/rewardBoosts');
const habits = require('../utils/habits');

beforeAll(() => initDatabase());

function giveBoostItem(userId) {
    db.prepare("INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, 'water_boost', 1)").run(userId);
}
function boostItems(userId) {
    return db.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM inventory WHERE user_id = ? AND item_key = 'water_boost'").get(userId).n;
}

describe('Pro streak shields', () => {
    test('three shields per month, refilled when a new month starts', () => {
        const user = 'pro_shield_user';
        getOrCreateUser(user);
        grantProAccess(user, 30, 'TEST');

        expect([1, 2, 3, 4].map(() => consumeProStreakShield(user))).toEqual([true, true, true, false]);

        db.prepare("UPDATE users SET pro_shields_month = '2000-01' WHERE discord_id = ?").run(user);
        expect(consumeProStreakShield(user)).toBe(true);
        expect(db.prepare('SELECT streak_shields_remaining AS n FROM users WHERE discord_id = ?').get(user).n).toBe(2);
    });

    test('free users have no shields', () => {
        getOrCreateUser('free_shield_user');
        expect(consumeProStreakShield('free_shield_user')).toBe(false);
    });
});

describe('2x water', () => {
    test('Pro doubles water without using up a water_boost item', () => {
        const user = 'pro_water_user';
        getOrCreateUser(user);
        grantProAccess(user, 30, 'TEST');
        giveBoostItem(user);

        expect(applyWaterDoubler(user, 5)).toEqual({ water: 10, source: 'premium' });
        expect(boostItems(user)).toBe(1);
    });

    test('free users use the item', () => {
        const user = 'free_water_user';
        getOrCreateUser(user);
        giveBoostItem(user);

        expect(applyWaterDoubler(user, 5)).toEqual({ water: 10, source: 'item' });
        expect(boostItems(user)).toBe(0);
    });
});

describe('habit limits', () => {
    test('5 habits free, 15 with Pro', () => {
        getOrCreateUser('free_habit_user');
        getOrCreateUser('pro_habit_user');
        grantProAccess('pro_habit_user', 30, 'TEST');
        expect(habits.getHabitLimit('free_habit_user')).toBe(habits.FREE_HABITS);
        expect(habits.getHabitLimit('pro_habit_user')).toBe(habits.PRO_HABITS);
        expect(habits.FREE_HABITS).toBe(5);
        expect(habits.PRO_HABITS).toBe(15);
    });
});
