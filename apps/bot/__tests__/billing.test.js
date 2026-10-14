const { initDatabase, db, getOrCreateUser, grantPremium, getPremiumEntitlement } = require('../utils/database');
const { applyPaddleEvent } = require('../services/billingProcessor');
const { buyButtons, checkoutConfigured, manageUrl } = require('../utils/billing');
const { triggerUpsell } = require('../utils/upsellManager');

beforeAll(() => initDatabase());
beforeEach(() => {
    db.exec("DELETE FROM billing_subscriptions; DELETE FROM premium_entitlements WHERE user_id LIKE '1000%'");
    process.env.PADDLE_ENV = 'production';
    delete process.env.PADDLE_TEST_DISCORD_IDS;
    delete process.env.PRO_SALES_OPEN;
});

const USER = '100000000000000001';
const inDays = d => new Date(Date.now() + d * 86400000).toISOString();

function subscriptionEvent(eventType, status, { discordId = USER, periodEnd = 30, id = 'sub_01', interval = 'month' } = {}) {
    return {
        event_id: `evt_${eventType}_${status}`,
        event_type: eventType,
        data: {
            id, status, customer_id: 'ctm_01',
            custom_data: discordId ? { discord_id: discordId } : null,
            current_billing_period: periodEnd === null ? null : { starts_at: inDays(periodEnd - 30), ends_at: inDays(periodEnd) },
            next_billed_at: periodEnd === null ? null : inDays(periodEnd),
            items: [{ price: { id: 'pri_01', billing_cycle: { interval, frequency: 1 } } }],
            management_urls: { cancel: 'https://sandbox-buyer-portal.paddle.com/subscriptions/sub_01/cancel' },
        },
    };
}
const adjustment = (action, status, subscriptionId = 'sub_01') => ({
    event_type: 'adjustment.updated',
    data: { id: 'adj_01', action, status, subscription_id: subscriptionId, transaction_id: 'txn_01' },
});
const expiry = () => new Date(`${getPremiumEntitlement(USER).expires_at.replace(' ', 'T')}Z`);
const daysLeft = () => Math.round((expiry() - Date.now()) / 86400000);

describe('Paddle → Pomo Pro', () => {
    test('a new subscription turns Pro on until the period ends plus grace', () => {
        const out = applyPaddleEvent(subscriptionEvent('subscription.created', 'active'));
        expect(out).toMatchObject({ change: 'activated', plan: 'Monthly' });
        expect(getPremiumEntitlement(USER)).toMatchObject({ status: 'active', source: 'paddle' });
        expect(daysLeft()).toBe(32);
    });

    test('the same event twice does not add extra days', () => {
        applyPaddleEvent(subscriptionEvent('subscription.created', 'active'));
        const out = applyPaddleEvent(subscriptionEvent('subscription.updated', 'active'));
        expect(out.change).toBe('renewed');
        expect(daysLeft()).toBe(32);
    });

    test('a yearly renewal moves Pro to the new period end', () => {
        applyPaddleEvent(subscriptionEvent('subscription.created', 'active', { interval: 'year', periodEnd: 365 }));
        expect(daysLeft()).toBe(367);
    });

    test('canceling ends Paddle Pro but never manual Pro', () => {
        applyPaddleEvent(subscriptionEvent('subscription.created', 'active'));
        const out = applyPaddleEvent(subscriptionEvent('subscription.canceled', 'canceled'));
        expect(out.change).toBe('ended');
        expect(getPremiumEntitlement(USER).status).toBe('revoked');

        const manual = '100000000000000002';
        getOrCreateUser(manual);
        grantPremium({ userId: manual, durationDays: 30, grantedBy: 'owner', source: 'manual' });
        applyPaddleEvent(subscriptionEvent('subscription.canceled', 'canceled', { discordId: manual, id: 'sub_02' }));
        expect(getPremiumEntitlement(manual).status).toBe('active');
    });

    test('an approved refund finds the owner through the saved subscription', () => {
        applyPaddleEvent(subscriptionEvent('subscription.created', 'active'));
        expect(applyPaddleEvent(adjustment('refund', 'pending_approval')).change).toBeUndefined();
        expect(getPremiumEntitlement(USER).status).toBe('active');
        expect(applyPaddleEvent(adjustment('refund', 'approved')).change).toBe('ended');
        expect(getPremiumEntitlement(USER).status).toBe('revoked');
    });

    test('a subscription without a Discord id is reported, not granted', () => {
        const out = applyPaddleEvent(subscriptionEvent('subscription.created', 'active', { discordId: null }));
        expect(out).toMatchObject({ change: 'unlinked', customer: 'ctm_01' });
    });

    test('sandbox payments only count for the listed test accounts', () => {
        process.env.PADDLE_ENV = 'sandbox';
        expect(applyPaddleEvent(subscriptionEvent('subscription.created', 'active')).result).toMatch(/not a test account/);
        expect(getPremiumEntitlement(USER)).toBeFalsy();

        process.env.PADDLE_TEST_DISCORD_IDS = `999, ${USER}`;
        expect(applyPaddleEvent(subscriptionEvent('subscription.created', 'active')).change).toBe('activated');
    });

    test('the manage link comes from the saved subscription', () => {
        applyPaddleEvent(subscriptionEvent('subscription.created', 'active'));
        expect(manageUrl(USER)).toMatch(/\/cancel$/);
    });
});

describe('buying from Discord', () => {
    test('plan buttons point at the pricing page once sales are open', () => {
        process.env.PRO_SALES_OPEN = 'true';
        const urls = buyButtons('en').map(b => b.toJSON().url);
        expect(urls).toEqual([
            'https://pomofocus.online/pricing?plan=monthly#pricing',
            'https://pomofocus.online/pricing?plan=yearly#pricing',
        ]);
    });

    test('no upsell when Pro cannot be bought', async () => {
        expect(checkoutConfigured()).toBe(false);
        const reply = jest.fn();
        const interaction = { user: { id: '1000999' }, locale: 'en', reply, followUp: reply };
        expect(await triggerUpsell(interaction, 'GENERIC')).toBe(false);
        expect(reply).not.toHaveBeenCalled();
    });
});
