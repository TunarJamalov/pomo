const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const {
    db,
    initDatabase,
    getOrCreateUser,
    getOrCreateGuildSettings,
    updateGuildSettings,
    isGlobalBuddyMatchingEnabled,
    createBuddyRequest,
    getWaitingBuddyRequests,
    getGlobalWaitingBuddyRequests,
} = require('../utils/database');
const { handleGlobalMatch } = require('../commands/setup');
const { findBestCandidate, candidateCardPayload } = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_optin_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

beforeAll(() => initDatabase());
afterAll(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM buddy_swipes;');
    db.exec('DELETE FROM buddy_blocks;');
    db.exec('DELETE FROM buddy_reports;');
    db.exec('DELETE FROM buddy_unmatches;');
    db.exec('DELETE FROM buddy_requests;');
    db.exec('DELETE FROM guild_settings;');
});

function makeReq(userId, guildId = 'guild_1', subject = 'Math', duration = 60, mode = 'silent') {
    const r = createBuddyRequest(userId, guildId, subject, duration, mode);
    return Number(r.lastInsertRowid);
}

function enableGlobal(guildId) {
    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, { global_buddy_matching_enabled: 1 });
}

function makeSetupIx({ guildId, isAdmin, enabled }) {
    const calls = { replies: [] };
    return {
        calls,
        guildId,
        locale: 'en',
        memberPermissions: { has: () => isAdmin },
        options: { getBoolean: () => enabled },
        reply: async (p) => { calls.replies.push(p); },
    };
}

function replyText(ix) {
    return JSON.stringify(ix.calls.replies);
}

describe('Server opt-in setting', () => {
    test('default is OFF for new servers', () => {
        getOrCreateGuildSettings('fresh_guild');
        expect(isGlobalBuddyMatchingEnabled('fresh_guild')).toBe(false);
    });

    test('legacy NULL value treated as OFF', () => {
        getOrCreateGuildSettings('legacy_guild');
        db.prepare('UPDATE guild_settings SET global_buddy_matching_enabled = NULL WHERE guild_id = ?')
            .run('legacy_guild');
        expect(isGlobalBuddyMatchingEnabled('legacy_guild')).toBe(false);
    });

    test('unknown guild treated as OFF', () => {
        expect(isGlobalBuddyMatchingEnabled('never_seen_guild')).toBe(false);
        expect(isGlobalBuddyMatchingEnabled(null)).toBe(false);
    });

    test('admin can enable it', async () => {
        const ix = makeSetupIx({ guildId: 'g_enable', isAdmin: true, enabled: true });
        await handleGlobalMatch(ix);

        expect(ix.calls.replies.length).toBe(1);
        expect(replyText(ix)).toContain('Enabled');
        expect(isGlobalBuddyMatchingEnabled('g_enable')).toBe(true);
    });

    test('admin can disable it', async () => {
        enableGlobal('g_disable');
        expect(isGlobalBuddyMatchingEnabled('g_disable')).toBe(true);

        const ix = makeSetupIx({ guildId: 'g_disable', isAdmin: true, enabled: false });
        await handleGlobalMatch(ix);

        expect(replyText(ix)).toContain('Disabled');
        expect(isGlobalBuddyMatchingEnabled('g_disable')).toBe(false);
    });

    test('non-admin cannot change it', async () => {
        enableGlobal('g_protected');

        const ix = makeSetupIx({ guildId: 'g_protected', isAdmin: false, enabled: false });
        await handleGlobalMatch(ix);

        expect(replyText(ix)).toContain('Permission Denied');
        expect(isGlobalBuddyMatchingEnabled('g_protected')).toBe(true);
    });

    test('non-admin cannot even view status', async () => {
        const ix = makeSetupIx({ guildId: 'g_status', isAdmin: false, enabled: null });
        await handleGlobalMatch(ix);

        expect(replyText(ix)).toContain('Permission Denied');
        expect(ix.calls.replies.length).toBe(1);
    });

    test('admin status view reflects current state', async () => {
        const offIx = makeSetupIx({ guildId: 'g_stat_off', isAdmin: true, enabled: null });
        await handleGlobalMatch(offIx);
        expect(replyText(offIx)).toContain('DISABLED');

        enableGlobal('g_stat_on');
        const onIx = makeSetupIx({ guildId: 'g_stat_on', isAdmin: true, enabled: null });
        await handleGlobalMatch(onIx);
        expect(replyText(onIx)).toContain('ENABLED');
    });
});

describe('Global pool eligibility', () => {
    test('OFF servers excluded; guilds without settings row excluded', () => {
        const a = getOrCreateUser('pool_a');
        const b = getOrCreateUser('pool_b');
        const c = getOrCreateUser('pool_c');
        makeReq(a.discord_id, 'pool_off'); // no settings row at all
        getOrCreateGuildSettings('pool_off_explicit'); // row exists, default OFF
        makeReq(b.discord_id, 'pool_off_explicit');
        enableGlobal('pool_on');
        makeReq(c.discord_id, 'pool_on');

        const global = getGlobalWaitingBuddyRequests();
        expect(global.map(r => r.user_id)).toEqual([c.discord_id]);
    });

    test('ON servers participate in global matching', () => {
        const a = getOrCreateUser('on_a');
        const b = getOrCreateUser('on_b');
        enableGlobal('on_guild_a');
        enableGlobal('on_guild_b');
        makeReq(a.discord_id, 'on_guild_a');
        makeReq(b.discord_id, 'on_guild_b');

        const global = getGlobalWaitingBuddyRequests();
        expect(global.length).toBe(2);
    });

    test('local matching still works when global is OFF', () => {
        const a = getOrCreateUser('loc_a');
        const b = getOrCreateUser('loc_b');
        makeReq(a.discord_id, 'loc_off', 'Math', 60, 'silent');
        makeReq(b.discord_id, 'loc_off', 'Math', 60, 'silent');

        expect(getGlobalWaitingBuddyRequests()).toEqual([]);
        expect(getWaitingBuddyRequests('loc_off').length).toBe(2);
    });

    test('disabling removes pending requests from global immediately, local intact', () => {
        const a = getOrCreateUser('dis_a');
        enableGlobal('dis_guild');
        const reqId = makeReq(a.discord_id, 'dis_guild');

        expect(getGlobalWaitingBuddyRequests().map(r => r.id)).toContain(reqId);

        updateGuildSettings('dis_guild', { global_buddy_matching_enabled: 0 });

        expect(getGlobalWaitingBuddyRequests().map(r => r.id)).not.toContain(reqId);
        // Local behavior preserved, request state uncorrupted
        expect(getWaitingBuddyRequests('dis_guild').map(r => r.id)).toContain(reqId);
        expect(db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(reqId).status).toBe('waiting');
    });

    test('OFF searcher sees only local even when ON candidates exist', () => {
        const a = getOrCreateUser('se_a');
        const b = getOrCreateUser('se_b');
        // A is alone on OFF guild; B waits on ON guild with compatible prefs
        const reqA = makeReq(a.discord_id, 'se_off', 'Math', 60, 'silent');
        makeReq(b.discord_id, 'se_on', 'Math', 60, 'silent');
        enableGlobal('se_on');

        const { candidate } = findBestCandidate({
            userId: a.discord_id,
            myRequestId: reqA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'se_off',
            excludeUserIds: new Set(),
        });
        expect(candidate).toBeNull();
    });

    test('ON searcher finds ON cross-server candidate via global fallback', () => {
        const a = getOrCreateUser('go_a');
        const b = getOrCreateUser('go_b');
        enableGlobal('go_guild_a');
        enableGlobal('go_guild_b');
        const reqA = makeReq(a.discord_id, 'go_guild_a', 'Math', 60, 'silent');
        makeReq(b.discord_id, 'go_guild_b', 'Math', 60, 'silent');

        const { candidate, score } = findBestCandidate({
            userId: a.discord_id,
            myRequestId: reqA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'go_guild_a',
            excludeUserIds: new Set(),
        });
        expect(candidate).toBeTruthy();
        expect(candidate.user_id).toBe(b.discord_id);
        expect(score).toBeGreaterThanOrEqual(50);
    });
});

describe('Cross-server privacy', () => {
    test('cross-server card shows no server identity', () => {
        const candidate = {
            id: 777,
            user_id: 'priv_user_321',
            guild_id: 'priv_guild_654',
            subject: 'Physics',
            duration: 45,
            mode: 'voice',
        };
        const payload = candidateCardPayload({
            candidate,
            prefs: { subject: 'Physics', duration: 45, mode: 'voice' },
            score: 60,
            myRequestId: 9,
            guildId: 'home_guild_111',
            likedYou: false,
        });

        const text = JSON.stringify(payload);
        expect(text).toContain('Another server');
        expect(text).toContain('Physics');
        expect(text).not.toContain('priv_user_321');
        expect(text).not.toContain('priv_guild_654');
        expect(text).not.toContain('home_guild_111');
        expect(text).not.toContain('<@');
    });
});
