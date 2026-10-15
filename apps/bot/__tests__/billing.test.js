const { initDatabase, db, getOrCreateUser, grantPremium, getPremiumEntitlement } = require('../utils/database');
const { addPeriod, applyPaymentResult, renewDue } = require('../services/billingProcessor');
const { sign, encode, verifyAndDecode } = require('../utils/epoint');
const { buyButtons, checkoutConfigured, manageUrl } = require('../utils/billing');
const { triggerUpsell } = require('../utils/upsellManager');

const USER = '100000000000000001';
const NOW = new Date(Date.UTC(2026, 9, 15, 12));

beforeAll(() => initDatabase());
beforeEach(() => {
    db.exec(`
        DELETE FROM epoint_orders; DELETE FROM epoint_subscriptions;
        DELETE FROM premium_entitlements WHERE user_id LIKE '1000%';
    `);
    getOrCreateUser(USER);
    db.prepare('UPDATE users SET streak_shields_remaining = 0 WHERE discord_id = ?').run(USER);
    delete process.env.PRO_SALES_OPEN;
});

function order(orderId, { plan = 'pro', cycle = 'monthly', amount = '3.49' } = {}) {
    db.prepare("INSERT INTO epoint_orders (order_id, discord_id, plan, cycle, amount) VALUES (?, ?, ?, ?, ?)")
        .run(orderId, USER, plan, cycle, amount);
}
const paid = (orderId, extra = {}) => ({
    order_id: orderId, status: 'success', amount: 3.49, transaction: `te_${orderId}`,
    card_id: 'card_abc', card_mask: '416973******1234', operation_code: '200', ...extra,
});
const subscription = () => db.prepare('SELECT * FROM epoint_subscriptions WHERE discord_id = ? ORDER BY id DESC').get(USER);
const expiry = () => new Date(`${getPremiumEntitlement(USER).expires_at.replace(' ', 'T')}Z`);
const later = days => new Date(NOW.getTime() + days * 86400000);

describe('Epoint signatures', () => {
    test('match the example in the Epoint docs', () => {
        const data = 'eyJwdWJsaWNfa2V5IjoiaTAwMDAwMDAwMSIsImFtb3VudCI6IjMwLjc1IiwiY3VycmVuY3kiOiJBWk4iLCJkZXNjcmlwdGlvbiI6InRlc3QgcGF5bWVudCIsIm9yZGVyX2lkIjoiMSJ9';
        expect(sign(data, 'd3hjsl38sd8kdfhbcea0be04eafde9e8e2bad2fb092d')).toBe('a76GNudqblZtV8qF199hctA+cG0=');
    });

    test('a callback is decoded only with the right signature', () => {
        const data = encode({ order_id: 'o1', status: 'success' });
        expect(verifyAndDecode(data, sign(data, 'secret'), 'secret')).toEqual({ order_id: 'o1', status: 'success' });
        expect(verifyAndDecode(data, sign(data, 'other'), 'secret')).toBeNull();
        expect(verifyAndDecode(encode({ order_id: 'o2' }), sign(data, 'secret'), 'secret')).toBeNull();
    });
});

describe('first payment', () => {
    test('opens a subscription with the saved card and turns Pro on, with shields', () => {
        order('o1');
        const out = applyPaymentResult(paid('o1'), NOW);
        expect(out).toMatchObject({ change: 'activated', plan: 'pro', userId: USER });
        expect(subscription()).toMatchObject({ plan: 'pro', cycle: 'monthly', amount: '3.49', card_id: 'card_abc', status: 'active', current_period_end: '2026-11-15 12:00:00' });
        expect(getPremiumEntitlement(USER)).toMatchObject({ status: 'active', source: 'epoint', plan_key: 'pro' });
        // period end + 3 days grace
        expect(expiry().toISOString()).toBe('2026-11-18T12:00:00.000Z');
        expect(db.prepare('SELECT streak_shields_remaining AS n FROM users WHERE discord_id = ?').get(USER).n).toBe(3);
    });

    test('Plus gets its plan and no shields; yearly runs a year', () => {
        order('o1', { plan: 'plus', cycle: 'yearly', amount: '19.99' });
        applyPaymentResult(paid('o1', { amount: '19.99' }), NOW);
        expect(getPremiumEntitlement(USER).plan_key).toBe('plus');
        expect(subscription().current_period_end).toBe('2027-10-15 12:00:00');
        expect(db.prepare('SELECT streak_shields_remaining AS n FROM users WHERE discord_id = ?').get(USER).n).toBe(0);
    });

    test('the same callback twice changes nothing the second time', () => {
        order('o1');
        applyPaymentResult(paid('o1'), NOW);
        expect(applyPaymentResult(paid('o1'), later(5)).result).toMatch(/already applied/);
        expect(db.prepare('SELECT COUNT(*) AS n FROM epoint_subscriptions').get().n).toBe(1);
    });

    test('a failed payment, an unknown order or a wrong amount grant nothing', () => {
        order('o1');
        expect(applyPaymentResult({ order_id: 'o1', status: 'failed', message: 'declined' }, NOW).change).toBeUndefined();
        expect(db.prepare("SELECT status FROM epoint_orders WHERE order_id = 'o1'").get().status).toBe('failed');
        expect(applyPaymentResult(paid('nope'), NOW).result).toMatch(/unknown order/);
        order('o2');
        expect(applyPaymentResult(paid('o2', { amount: 0.01 }), NOW).change).toBe('mismatch');
        expect(getPremiumEntitlement(USER)?.status).not.toBe('active');
    });
});

describe('renewals', () => {
    function subscribe() {
        order('o1');
        applyPaymentResult(paid('o1'), NOW);
    }
    const ok = jest.fn(async ({ orderId, amount }) => ({ status: 'success', transaction: `te_${orderId}`, amount: Number(amount) }));
    const declined = jest.fn(async () => ({ status: 'failed', message: 'Insufficient funds' }));
    beforeEach(() => { ok.mockClear(); declined.mockClear(); });

    test('nothing is charged before the period ends', async () => {
        subscribe();
        expect(await renewDue(later(29), ok)).toEqual([]);
        expect(ok).not.toHaveBeenCalled();
    });

    test('a due subscription charges the saved card and moves to the next period', async () => {
        subscribe();
        const [out] = await renewDue(later(31), ok);
        expect(ok).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'card_abc', amount: '3.49' }));
        expect(out.change).toBe('renewed');
        expect(subscription().current_period_end).toBe('2026-12-15 12:00:00');
        expect(expiry().toISOString()).toBe('2026-12-18T12:00:00.000Z');
    });

    test('a declined card is retried daily and the plan ends after the third failure', async () => {
        subscribe();
        expect((await renewDue(later(31), declined))[0].change).toBe('payment_failed');
        expect(subscription()).toMatchObject({ status: 'past_due', failed_attempts: 1 });
        expect(await renewDue(later(31.5), declined)).toEqual([]);
        expect((await renewDue(later(32), declined))[0].change).toBeUndefined();
        const [last] = await renewDue(later(33), declined);
        expect(last.change).toBe('ended');
        expect(subscription().status).toBe('ended');
        expect(getPremiumEntitlement(USER).status).not.toBe('active');
        expect(declined).toHaveBeenCalledTimes(3);
    });

    test('a later success clears the failures', async () => {
        subscribe();
        await renewDue(later(31), declined);
        await renewDue(later(32), ok);
        expect(subscription()).toMatchObject({ status: 'active', failed_attempts: 0, current_period_end: '2026-12-15 12:00:00' });
    });

    test('a cancelled subscription is not charged and its plan ends with the period', async () => {
        subscribe();
        db.prepare('UPDATE epoint_subscriptions SET cancel_at_period_end = 1').run();
        const [out] = await renewDue(later(31), ok);
        expect(ok).not.toHaveBeenCalled();
        expect(out.change).toBe('ended');
        expect(subscription().status).toBe('canceled');
        expect(getPremiumEntitlement(USER).status).not.toBe('active');
    });

    test('no answer from Epoint: wait for the callback instead of charging again', async () => {
        subscribe();
        const silent = jest.fn(async () => { throw new Error('timeout'); });
        await renewDue(later(31), silent);
        const pending = db.prepare("SELECT order_id FROM epoint_orders WHERE kind = 'renewal'").get();
        expect(await renewDue(later(31.1), ok)).toEqual([expect.objectContaining({ result: expect.stringMatching(/waiting/) })]);
        expect(ok).not.toHaveBeenCalled();
        // The callback arrives and settles it
        expect(applyPaymentResult({ order_id: pending.order_id, status: 'success', amount: 3.49 }, later(31.2)).change).toBe('renewed');
        expect(subscription().current_period_end).toBe('2026-12-15 12:00:00');
    });

    test('cancelling never touches Pro that was granted by hand', async () => {
        subscribe();
        grantPremium({ userId: USER, durationDays: 60, grantedBy: 'owner' });
        db.prepare('UPDATE epoint_subscriptions SET cancel_at_period_end = 1').run();
        await renewDue(later(31), ok);
        expect(getPremiumEntitlement(USER).status).toBe('active');
    });
});

test('a month later keeps the day where the month has it', () => {
    expect(addPeriod(new Date('2026-01-31T10:00:00Z'), 'monthly').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addPeriod(new Date('2028-01-31T10:00:00Z'), 'monthly').toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addPeriod(new Date('2026-12-15T10:00:00Z'), 'monthly').toISOString()).toBe('2027-01-15T10:00:00.000Z');
    expect(addPeriod(new Date('2028-02-29T10:00:00Z'), 'yearly').toISOString()).toBe('2029-02-28T10:00:00.000Z');
});

describe('buying from Discord', () => {
    test('the manage link is the billing page while a subscription runs', () => {
        expect(manageUrl(USER)).toBeNull();
        order('o1');
        applyPaymentResult(paid('o1'), NOW);
        expect(manageUrl(USER)).toBe('https://pomofocus.online/billing');
    });

    test('plan buttons point at the pricing page once sales are open', () => {
        process.env.PRO_SALES_OPEN = 'true';
        const buttons = buyButtons('en').map(b => b.toJSON());
        expect(buttons.map(b => b.url)).toEqual([
            'https://pomofocus.online/pricing?plan=plus#pricing',
            'https://pomofocus.online/pricing?plan=pro#pricing',
        ]);
        expect(buttons[0].label).toContain('2.49 AZN');
    });

    test('no upsell when a plan cannot be bought', async () => {
        expect(checkoutConfigured()).toBe(false);
        const reply = jest.fn();
        const interaction = { user: { id: '1000999' }, locale: 'en', reply, followUp: reply };
        expect(await triggerUpsell(interaction, 'GENERIC')).toBe(false);
        expect(reply).not.toHaveBeenCalled();
    });
});
