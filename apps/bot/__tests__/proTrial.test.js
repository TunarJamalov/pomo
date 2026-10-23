const { initDatabase, db, getOrCreateUser, getPremiumEntitlement } = require('../utils/database');
const { grantProAccess, getProTier } = require('../utils/premiumManager');
const {
    PRO_TRIAL_DAYS,
    isProTrialAvailable,
    startProTrial,
    hasUsedProTrial,
    handleProTrialButton,
} = require('../utils/proTrial');

const NEW_USER = '300000000000000001';
const PLUS_USER = '300000000000000002';
const BUTTON_USER = '300000000000000003';
const salesOpen = process.env.PRO_SALES_OPEN;

beforeAll(() => initDatabase());
beforeEach(() => {
    process.env.PRO_SALES_OPEN = 'true';
    db.exec("DELETE FROM premium_entitlements WHERE user_id LIKE '3000%'");
    db.exec("DELETE FROM premium_events WHERE user_id LIKE '3000%'");
    [NEW_USER, PLUS_USER, BUTTON_USER].forEach(getOrCreateUser);
    db.prepare("UPDATE users SET premium = 0, streak_shields_remaining = 0 WHERE discord_id LIKE '3000%'").run();
});
afterAll(() => {
    if (salesOpen === undefined) delete process.env.PRO_SALES_OPEN;
    else process.env.PRO_SALES_OPEN = salesOpen;
});

describe('7-day Pro trial', () => {
    test('is not offered while sales are closed', () => {
        process.env.PRO_SALES_OPEN = 'false';
        expect(isProTrialAvailable(NEW_USER)).toBe(false);
        expect(startProTrial(NEW_USER)).toEqual({ ok: false, reason: 'closed' });
        expect(getProTier(NEW_USER)).toBeNull();
    });

    test('gives a new user Pro for 7 days with streak shields', () => {
        expect(isProTrialAvailable(NEW_USER)).toBe(true);
        const result = startProTrial(NEW_USER);

        expect(result.ok).toBe(true);
        expect(getProTier(NEW_USER)).toBe('pro');
        expect(result.entitlement.source).toBe('trial');
        const days = (new Date(`${result.entitlement.expires_at.replace(' ', 'T')}Z`) - Date.now()) / 86400000;
        expect(days).toBeGreaterThan(PRO_TRIAL_DAYS - 0.01);
        expect(days).toBeLessThanOrEqual(PRO_TRIAL_DAYS);
        const user = db.prepare('SELECT streak_shields_remaining FROM users WHERE discord_id = ?').get(NEW_USER);
        expect(user.streak_shields_remaining).toBeGreaterThan(0);
    });

    test('works once per account, even after the trial has expired', () => {
        startProTrial(NEW_USER);
        expect(startProTrial(NEW_USER)).toEqual({ ok: false, reason: 'active' });

        db.prepare("UPDATE premium_entitlements SET expires_at = datetime('now', '-1 minute') WHERE user_id = ?").run(NEW_USER);
        expect(getPremiumEntitlement(NEW_USER).status).toBe('expired');
        expect(hasUsedProTrial(NEW_USER)).toBe(true);
        expect(startProTrial(NEW_USER)).toEqual({ ok: false, reason: 'used' });
        expect(getProTier(NEW_USER)).toBeNull();
    });

    test('is not offered to someone who already has a plan', () => {
        grantProAccess(PLUS_USER, 30, 'test', { planKey: 'plus' });
        expect(isProTrialAvailable(PLUS_USER)).toBe(false);
        expect(startProTrial(PLUS_USER)).toEqual({ ok: false, reason: 'active' });
        expect(getProTier(PLUS_USER)).toBe('plus');
    });

    test('the button starts the trial once and explains the second click', async () => {
        const interaction = { user: { id: BUTTON_USER }, locale: 'en-US', reply: jest.fn().mockResolvedValue(null) };

        await handleProTrialButton(interaction);
        expect(interaction.reply.mock.calls[0][0].embeds).toHaveLength(1);
        expect(getProTier(BUTTON_USER)).toBe('pro');

        await handleProTrialButton(interaction);
        expect(interaction.reply.mock.calls[1][0].content).toMatch(/already/i);
    });
});
