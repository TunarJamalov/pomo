const { initDatabase, db, getOrCreateUser, recordStreakBreak } = require('../utils/database');
const { grantProAccess } = require('../utils/premiumManager');
const { maybeSendStreakBreakUpsell } = require('../utils/upsellManager');

const BROKEN = '310000000000000001';
const PRO = '310000000000000002';
const EXPIRED = '310000000000000003';
const salesOpen = process.env.PRO_SALES_OPEN;

function commandInteraction(userId, commandName = 'study') {
    return {
        isChatInputCommand: () => true,
        commandName,
        user: { id: userId },
        locale: 'en-US',
        replied: true,
        followUp: jest.fn().mockResolvedValue({}),
        reply: jest.fn().mockResolvedValue({}),
    };
}

beforeAll(() => initDatabase());
beforeEach(() => {
    process.env.PRO_SALES_OPEN = 'true';
    for (const table of ['upsell_log', 'streak_breaks', 'premium_entitlements', 'premium_events']) {
        db.prepare(`DELETE FROM ${table} WHERE user_id LIKE '3100%'`).run();
    }
    [BROKEN, PRO, EXPIRED].forEach(getOrCreateUser);
    db.prepare("UPDATE users SET premium = 0, water = 120 WHERE discord_id LIKE '3100%'").run();
    recordStreakBreak(BROKEN, 23, 2);
});
afterAll(() => {
    if (salesOpen === undefined) delete process.env.PRO_SALES_OPEN;
    else process.env.PRO_SALES_OPEN = salesOpen;
});

describe('STREAK_BREAK upsell', () => {
    test('offers water repair, Pro and the trial while the break can still be recovered', async () => {
        const interaction = commandInteraction(BROKEN);
        expect(await maybeSendStreakBreakUpsell(interaction)).toBe(true);

        const payload = interaction.followUp.mock.calls[0][0];
        expect(payload.flags).toBe(64);
        const body = payload.embeds[0].data.description;
        expect(body).toContain('23-day streak');
        expect(body).toContain('/streak repair');
        expect(body).toContain('you have 120');
        const ids = payload.components[0].components.map(c => c.data.custom_id).filter(Boolean);
        expect(ids).toEqual(expect.arrayContaining(['pro_trial_start', 'upsell_dismiss']));
        expect(db.prepare("SELECT COUNT(*) AS n FROM upsell_log WHERE user_id = ? AND upsell_type = 'STREAK_BREAK'").get(BROKEN).n).toBe(1);
    });

    test('shows once, not after every command', async () => {
        expect(await maybeSendStreakBreakUpsell(commandInteraction(BROKEN))).toBe(true);
        expect(await maybeSendStreakBreakUpsell(commandInteraction(BROKEN))).toBe(false);
    });

    test('stays quiet while sales are closed, inside /streak, and for paid users', async () => {
        process.env.PRO_SALES_OPEN = 'false';
        expect(await maybeSendStreakBreakUpsell(commandInteraction(BROKEN))).toBe(false);
        process.env.PRO_SALES_OPEN = 'true';

        expect(await maybeSendStreakBreakUpsell(commandInteraction(BROKEN, 'streak'))).toBe(false);

        recordStreakBreak(PRO, 10, 2);
        grantProAccess(PRO, 30, 'test', { planKey: 'pro' });
        expect(await maybeSendStreakBreakUpsell(commandInteraction(PRO))).toBe(false);
    });

    test('says nothing once the 48-hour recovery window has passed', async () => {
        recordStreakBreak(EXPIRED, 12, 2, new Date(Date.now() - 49 * 3600 * 1000));
        expect(await maybeSendStreakBreakUpsell(commandInteraction(EXPIRED))).toBe(false);
    });
});
