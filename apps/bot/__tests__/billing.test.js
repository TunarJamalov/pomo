const { initDatabase, db, getOrCreateUser, grantPremium, getPremiumEntitlement } = require('../utils/database');
const { applyLemonSqueezyEvent } = require('../services/billingProcessor');
const { checkoutUrl } = require('../utils/billing');

beforeAll(() => initDatabase());
beforeEach(() => db.exec("DELETE FROM billing_subscriptions; DELETE FROM premium_entitlements WHERE user_id LIKE '1000%'"));

const USER = '100000000000000001';
const inDays = d => new Date(Date.now() + d * 86400000).toISOString();

function subscriptionEvent(eventName, status, { discordId = USER, renews = 30, ends = null, id = 'sub_1', test = false } = {}) {
    return {
        meta: { event_name: eventName, test_mode: test, custom_data: discordId ? { discord_id: discordId } : undefined },
        data: {
            type: 'subscriptions', id,
            attributes: {
                status, variant_name: 'Monthly', user_email: 'buyer@example.com',
                renews_at: renews === null ? null : inDays(renews), ends_at: ends === null ? null : inDays(ends),
                urls: { customer_portal: 'https://pomo.lemonsqueezy.com/billing/abc' },
            },
        },
    };
}
const expiry = () => new Date(`${getPremiumEntitlement(USER).expires_at.replace(' ', 'T')}Z`);
const daysLeft = () => Math.round((expiry() - Date.now()) / 86400000);

describe('Lemon Squeezy → Pomo Pro', () => {
    test('a new subscription turns Pro on until the renewal date plus grace', () => {
        const out = applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active'));
        expect(out.change).toBe('activated');
        expect(getPremiumEntitlement(USER)).toMatchObject({ status: 'active', source: 'lemonsqueezy' });
        expect(daysLeft()).toBe(32);
    });

    test('the same event twice does not add extra days', () => {
        applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active'));
        const out = applyLemonSqueezyEvent(subscriptionEvent('subscription_updated', 'active'));
        expect(out.change).toBe('renewed');
        expect(daysLeft()).toBe(32);
    });

    test('cancelling keeps Pro until the paid period ends', () => {
        applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active'));
        applyLemonSqueezyEvent(subscriptionEvent('subscription_cancelled', 'cancelled', { renews: null, ends: 30 }));
        expect(getPremiumEntitlement(USER).status).toBe('active');
    });

    test('expiry and refunds revoke Lemon Squeezy Pro only', () => {
        applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active'));
        const out = applyLemonSqueezyEvent(subscriptionEvent('subscription_expired', 'expired', { renews: null }));
        expect(out.change).toBe('ended');
        expect(getPremiumEntitlement(USER).status).toBe('revoked');

        const manual = '100000000000000002';
        getOrCreateUser(manual);
        grantPremium({ userId: manual, durationDays: 30, grantedBy: 'owner', source: 'manual' });
        applyLemonSqueezyEvent(subscriptionEvent('subscription_expired', 'expired', { discordId: manual, renews: null, id: 'sub_2' }));
        expect(getPremiumEntitlement(manual).status).toBe('active');
    });

    test('a refunded invoice finds the owner through the saved subscription', () => {
        applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active'));
        const out = applyLemonSqueezyEvent({
            meta: { event_name: 'subscription_payment_refunded' },
            data: { type: 'subscription-invoices', id: 'inv_1', attributes: { subscription_id: 'sub_1' } },
        });
        expect(out.change).toBe('ended');
    });

    test('test-mode payments are ignored unless allowed', () => {
        expect(applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active', { test: true })).result).toMatch(/ignored/);
        expect(getPremiumEntitlement(USER)).toBeFalsy();
        expect(applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active', { test: true }), { allowTest: true }).change).toBe('activated');
    });

    test('a payment without a Discord id is reported, not granted', () => {
        const out = applyLemonSqueezyEvent(subscriptionEvent('subscription_created', 'active', { discordId: null }));
        expect(out.change).toBe('unlinked');
        expect(out.email).toBe('buyer@example.com');
    });
});

describe('checkout links', () => {
    test('carry the Discord id as custom data', () => {
        process.env.LEMONSQUEEZY_CHECKOUT_MONTHLY = 'https://pomo.lemonsqueezy.com/buy/abc-123';
        const url = new URL(checkoutUrl('monthly', USER));
        expect(url.searchParams.get('checkout[custom][discord_id]')).toBe(USER);
        expect(checkoutUrl('yearly', USER)).toBeNull();
    });
});
