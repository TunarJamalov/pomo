const { initDatabase, db, getOrCreateUser, grantPremium, extendPremiumUntil, getPremiumEntitlement } = require('../utils/database');
const { grantProAccess, getProTier, isProActive, isFullPro, consumeProStreakShield } = require('../utils/premiumManager');
const { getPremiumStatus, hasFullPro } = require('../utils/premiumCheck');
const { getHabitLimit } = require('../utils/habits');
const { t } = require('../utils/i18n');

const FREE = '200000000000000001';
const PLUS = '200000000000000002';
const PRO = '200000000000000003';
const BETA = '200000000000000004';
const client = { guilds: { fetch: jest.fn().mockRejectedValue(new Error('no guild')) } };

beforeAll(() => initDatabase());
beforeEach(() => {
    db.exec("DELETE FROM premium_entitlements WHERE user_id LIKE '2000%'");
    [FREE, PLUS, PRO, BETA].forEach(getOrCreateUser);
    db.prepare("UPDATE users SET premium = 0, streak_shields_remaining = 0 WHERE discord_id LIKE '2000%'").run();
    grantProAccess(PLUS, 30, 'test', { planKey: 'plus' });
    grantProAccess(PRO, 30, 'test', { planKey: 'pro' });
    // Grants made before the two plans existed keep the old key and stay Pro
    grantPremium({ userId: BETA, durationDays: 30, grantedBy: 'test' });
});

describe('Pomo Plus and Pomo Pro', () => {
    test('each user gets the right tier', () => {
        expect([FREE, PLUS, PRO, BETA].map(getProTier)).toEqual([null, 'plus', 'pro', 'pro']);
        expect([FREE, PLUS, PRO].map(isProActive)).toEqual([false, true, true]);
        expect([FREE, PLUS, PRO].map(isFullPro)).toEqual([false, false, true]);
    });

    test('async checks agree for Pro-only commands', async () => {
        expect((await getPremiumStatus(client, PLUS)).tier).toBe('plus');
        expect(await hasFullPro(client, PLUS)).toBe(false);
        expect(await hasFullPro(client, PRO)).toBe(true);
        expect(await hasFullPro(client, BETA)).toBe(true);
    });

    test('habit limits are 5, 10 and 15', () => {
        expect([FREE, PLUS, PRO].map(getHabitLimit)).toEqual([5, 10, 15]);
    });

    test('streak shields are a Pro perk', () => {
        expect(consumeProStreakShield(PLUS)).toBe(false);
        expect(consumeProStreakShield(PRO)).toBe(true);
    });

    test('a paid renewal keeps the plan that was bought', () => {
        extendPremiumUntil({ userId: PLUS, until: new Date(Date.now() + 60 * 86400000), grantedBy: 'test', source: 'epoint', planKey: 'plus' });
        expect(getPremiumEntitlement(PLUS).plan_key).toBe('plus');
        extendPremiumUntil({ userId: PLUS, until: new Date(Date.now() + 60 * 86400000), grantedBy: 'test', source: 'epoint', planKey: 'pro' });
        expect(getProTier(PLUS)).toBe('pro');
    });

    test('plan texts exist in every language', () => {
        for (const lang of ['en', 'es', 'fr', 'pt-BR', 'ru', 'tr', 'az', 'ja', 'ko', 'ar']) {
            for (const key of ['planPlusItems', 'planProItems', 'planPlusTitle', 'planProTitle', 'planBuyPlus', 'planBuyPro']) {
                const text = t(lang, key, { monthly: '$1.49', yearly: '$11.99', price: '$1.49' });
                expect(text).not.toBe(key);
                // Discord embed field limits
                expect(text.length).toBeLessThanOrEqual(key.endsWith('Title') ? 256 : 1024);
            }
        }
    });
});
