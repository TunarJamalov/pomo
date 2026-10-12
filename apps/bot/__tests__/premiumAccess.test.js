const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_premium_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;
process.env.PREMIUM_GUILD_ID = 'support_guild';
process.env.PREMIUM_ROLE_ID = 'premium_role';

const {
    db,
    initDatabase,
    getOrCreateUser,
    getPremiumEntitlement,
    grantPremium,
    revokePremium,
    listActivePremiumEntitlements,
    expirePremiumEntitlements,
    getPremiumEvents,
} = require('../utils/database');
const { getPremiumStatus, isPremium } = require('../utils/premiumCheck');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
    delete process.env.PREMIUM_GUILD_ID;
    delete process.env.PREMIUM_ROLE_ID;
});

beforeEach(() => {
    db.exec('DELETE FROM premium_events; DELETE FROM premium_entitlements; DELETE FROM users;');
});

describe('managed premium access', () => {
    test('grants timed access and extends from the existing expiry', () => {
        const first = grantPremium({
            userId: 'premium_user',
            durationDays: 30,
            grantedBy: 'owner',
            note: 'Beta tester',
        });
        const second = grantPremium({
            userId: 'premium_user',
            durationDays: 10,
            grantedBy: 'owner',
        });
        const extension = db.prepare(`
            SELECT CAST(julianday(?) - julianday(?) AS INTEGER) as days
        `).get(second.expires_at, first.expires_at);

        expect(first.status).toBe('active');
        expect(first.plan_key).toBe('pro_beta');
        expect(extension.days).toBe(10);
        expect(getPremiumEvents('premium_user')).toHaveLength(2);
    });

    test('keeps an explicitly present premium role authoritative after an old expiry', async () => {
        grantPremium({
            userId: 'expired_user',
            durationDays: 1,
            grantedBy: 'owner',
        });
        db.prepare(`
            UPDATE premium_entitlements
            SET expires_at = datetime('now', '-1 minute')
            WHERE user_id = ?
        `).run('expired_user');

        const client = createRoleClient({ hasRole: true });
        const status = await getPremiumStatus(client, 'expired_user');

        expect(status.active).toBe(true);
        expect(status.source).toBe('discord_role');
        expect(getPremiumEntitlement('expired_user').status).toBe('expired');
    });

    test('revoke disables managed and legacy access', async () => {
        getOrCreateUser('revoked_user');
        db.prepare('UPDATE users SET premium = 1 WHERE discord_id = ?').run('revoked_user');
        grantPremium({
            userId: 'revoked_user',
            durationDays: 30,
            grantedBy: 'owner',
        });

        expect(revokePremium('revoked_user', 'owner', 'Beta ended')).toBe(true);
        expect(db.prepare('SELECT premium FROM users WHERE discord_id = ?').get('revoked_user').premium).toBe(0);
        expect(await isPremium(null, 'revoked_user')).toBe(false);
        expect(getPremiumEvents('revoked_user')[0].action).toBe('revoke');
    });

    test('keeps legacy database and support role access compatible', async () => {
        getOrCreateUser('legacy_user');
        db.prepare('UPDATE users SET premium = 1 WHERE discord_id = ?').run('legacy_user');
        expect(await isPremium(null, 'legacy_user')).toBe(true);

        const roleClient = createRoleClient({ hasRole: true });
        expect(await isPremium(roleClient, 'role_user')).toBe(true);
    });

    test('a role deliberately added again restores access after a revoke record', async () => {
        const roleClient = createRoleClient({ hasRole: true });
        expect(await isPremium(roleClient, 'role_only_user')).toBe(true);

        revokePremium('role_only_user', 'owner', 'Access removed');

        expect(await isPremium(null, 'role_only_user')).toBe(false);
        expect(await isPremium(roleClient, 'role_only_user')).toBe(true);
        expect(getPremiumEntitlement('role_only_user').status).toBe('revoked');
    });

    test('revoked and expired records remain inactive when no premium role is present', async () => {
        grantPremium({ userId: 'no_role_user', durationDays: 7, grantedBy: 'owner' });
        revokePremium('no_role_user', 'owner');

        const noRoleClient = createRoleClient({ hasRole: false });
        const status = await getPremiumStatus(noRoleClient, 'no_role_user');

        expect(status.active).toBe(false);
        expect(status.status).toBe('revoked');
    });

    test('Buy Me a Coffee membership role remains authoritative after a beta grant expires', async () => {
        process.env.PREMIUM_MEMBERSHIP_ROLE_ID = 'membership_role';
        grantPremium({
            userId: 'member_user',
            durationDays: 1,
            grantedBy: 'owner',
        });
        db.prepare(`
            UPDATE premium_entitlements
            SET expires_at = datetime('now', '-1 minute')
            WHERE user_id = ?
        `).run('member_user');

        const roleRemove = jest.fn().mockResolvedValue(undefined);
        const member = {
            roles: {
                cache: {
                    has: jest.fn(roleId => roleId === 'membership_role'),
                },
                add: jest.fn(),
                remove: roleRemove,
            },
        };
        const client = {
            guilds: {
                fetch: jest.fn().mockResolvedValue({
                    members: { fetch: jest.fn().mockResolvedValue(member) },
                }),
            },
        };

        const status = await getPremiumStatus(client, 'member_user');
        expect(status.active).toBe(true);
        expect(status.source).toBe('buymeacoffee_role');
        expect(roleRemove).not.toHaveBeenCalled();
        delete process.env.PREMIUM_MEMBERSHIP_ROLE_ID;
    });

    test('lists only active managed entitlements', () => {
        grantPremium({ userId: 'active_user', durationDays: 7, grantedBy: 'owner' });
        grantPremium({ userId: 'revoked_user', durationDays: 7, grantedBy: 'owner' });
        revokePremium('revoked_user', 'owner');

        expect(listActivePremiumEntitlements().map(row => row.user_id)).toEqual(['active_user']);
    });

    test('returns newly expired users for scheduled role cleanup', () => {
        grantPremium({ userId: 'cleanup_user', durationDays: 1, grantedBy: 'owner' });
        db.prepare(`
            UPDATE premium_entitlements
            SET expires_at = datetime('now', '-1 minute')
            WHERE user_id = ?
        `).run('cleanup_user');

        expect(expirePremiumEntitlements()).toEqual([{ user_id: 'cleanup_user' }]);
        expect(expirePremiumEntitlements()).toEqual([]);
    });
});

function createRoleClient({ hasRole, add = jest.fn(), remove = jest.fn() }) {
    const member = {
        roles: {
            cache: { has: jest.fn(() => hasRole) },
            add,
            remove,
        },
    };
    const guild = {
        members: {
            fetch: jest.fn().mockResolvedValue(member),
        },
    };
    return {
        guilds: {
            fetch: jest.fn().mockResolvedValue(guild),
        },
    };
}
