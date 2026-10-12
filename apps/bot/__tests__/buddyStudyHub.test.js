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
    isStudyHubEnabled,
    isStudyHubAcceptingGuests,
    getEligibleStudyHubs,
    createBuddyRequest,
    getWaitingBuddyRequests,
    getGlobalWaitingBuddyRequests,
} = require('../utils/database');
const { handleStudyHub } = require('../commands/setup');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_hub_${Date.now()}.db`);
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

function enableHub(guildId, acceptsGuests = true) {
    getOrCreateGuildSettings(guildId);
    updateGuildSettings(guildId, {
        study_hub_enabled: 1,
        study_hub_accepts_guests: acceptsGuests ? 1 : 0,
    });
}

function makeSetupIx({ guildId, isAdmin, enabled = null, acceptsGuests = null }) {
    const calls = { replies: [] };
    return {
        calls,
        guildId,
        locale: 'en',
        memberPermissions: { has: () => isAdmin },
        options: {
            getBoolean: (name) => {
                if (name === 'enabled') return enabled;
                if (name === 'accepts_guests') return acceptsGuests;
                return null;
            },
        },
        reply: async (p) => { calls.replies.push(p); },
    };
}

function replyText(ix) {
    return JSON.stringify(ix.calls.replies);
}

describe('Study Hub defaults', () => {
    test('default is OFF for new servers (both flags)', () => {
        getOrCreateGuildSettings('hub_fresh');
        expect(isStudyHubEnabled('hub_fresh')).toBe(false);
        expect(isStudyHubAcceptingGuests('hub_fresh')).toBe(false);
        expect(getEligibleStudyHubs()).toEqual([]);
    });

    test('legacy NULL values treated as OFF', () => {
        getOrCreateGuildSettings('hub_legacy');
        db.prepare('UPDATE guild_settings SET study_hub_enabled = NULL, study_hub_accepts_guests = NULL WHERE guild_id = ?')
            .run('hub_legacy');
        expect(isStudyHubEnabled('hub_legacy')).toBe(false);
        expect(isStudyHubAcceptingGuests('hub_legacy')).toBe(false);
    });

    test('unknown guild treated as OFF', () => {
        expect(isStudyHubEnabled('never_seen_hub')).toBe(false);
        expect(isStudyHubAcceptingGuests('never_seen_hub')).toBe(false);
        expect(isStudyHubEnabled(null)).toBe(false);
    });
});

describe('Study Hub admin control', () => {
    test('admin can enable it', async () => {
        const ix = makeSetupIx({ guildId: 'hub_enable', isAdmin: true, enabled: true });
        await handleStudyHub(ix, 'en');

        expect(ix.calls.replies.length).toBe(1);
        expect(isStudyHubEnabled('hub_enable')).toBe(true);
    });

    test('admin can disable it', async () => {
        enableHub('hub_disable');
        expect(isStudyHubEnabled('hub_disable')).toBe(true);

        const ix = makeSetupIx({ guildId: 'hub_disable', isAdmin: true, enabled: false });
        await handleStudyHub(ix, 'en');

        expect(isStudyHubEnabled('hub_disable')).toBe(false);
        expect(replyText(ix)).toContain('Unregistered');
    });

    test('accepts_guests toggles independently', async () => {
        enableHub('hub_pause', true);

        const ix = makeSetupIx({ guildId: 'hub_pause', isAdmin: true, enabled: null, acceptsGuests: false });
        await handleStudyHub(ix, 'en');

        expect(isStudyHubEnabled('hub_pause')).toBe(true);
        expect(isStudyHubAcceptingGuests('hub_pause')).toBe(false);
    });

    test('non-admin cannot change it', async () => {
        enableHub('hub_protected');

        const ix = makeSetupIx({ guildId: 'hub_protected', isAdmin: false, enabled: false });
        await handleStudyHub(ix, 'en');

        expect(replyText(ix)).toContain('Permission Denied');
        expect(isStudyHubEnabled('hub_protected')).toBe(true);
    });

    test('non-admin cannot view status', async () => {
        const ix = makeSetupIx({ guildId: 'hub_priv', isAdmin: false, enabled: null, acceptsGuests: null });
        await handleStudyHub(ix, 'en');

        expect(replyText(ix)).toContain('Permission Denied');
        expect(ix.calls.replies.length).toBe(1);
    });

    test('admin status view reflects current state', async () => {
        const offIx = makeSetupIx({ guildId: 'hub_stat_off', isAdmin: true });
        await handleStudyHub(offIx, 'en');
        expect(replyText(offIx)).toContain('DISABLED');

        enableHub('hub_stat_on');
        enableGlobal('hub_stat_on');
        const onIx = makeSetupIx({ guildId: 'hub_stat_on', isAdmin: true });
        await handleStudyHub(onIx, 'en');
        expect(replyText(onIx)).toContain('ENABLED');
        expect(replyText(onIx)).toContain('YES');
    });

    test('enabling hub while global is OFF warns about eligibility', async () => {
        const ix = makeSetupIx({ guildId: 'hub_warn', isAdmin: true, enabled: true });
        await handleStudyHub(ix, 'en');

        expect(isStudyHubEnabled('hub_warn')).toBe(true);
        expect(replyText(ix)).toContain('globalmatch');
        expect(getEligibleStudyHubs()).not.toContain('hub_warn');
    });
});

describe('Study Hub eligibility', () => {
    test('requires hub + guests + global (all combinations)', () => {
        enableGlobal('e_global_only');

        enableHub('e_hub_no_global');
        // global off here

        getOrCreateGuildSettings('e_hub_paused');
        updateGuildSettings('e_hub_paused', { study_hub_enabled: 1, study_hub_accepts_guests: 0 });
        enableGlobal('e_hub_paused');

        enableHub('e_full', true);
        enableGlobal('e_full');

        const eligible = getEligibleStudyHubs();
        expect(eligible).toEqual(['e_full']);
    });

    test('guilds without settings rows are excluded', () => {
        enableHub('e_real', true);
        enableGlobal('e_real');
        expect(getEligibleStudyHubs()).toEqual(['e_real']);
    });

    test('disabling hub removes eligibility immediately, global pool untouched', () => {
        const u = getOrCreateUser('hub_pool_u');
        enableHub('hub_pool', true);
        enableGlobal('hub_pool');
        const reqId = makeReq(u.discord_id, 'hub_pool');

        expect(getEligibleStudyHubs()).toContain('hub_pool');
        expect(getGlobalWaitingBuddyRequests().map(r => r.id)).toContain(reqId);

        updateGuildSettings('hub_pool', { study_hub_enabled: 0 });

        // Hub eligibility gone immediately...
        expect(getEligibleStudyHubs()).not.toContain('hub_pool');
        // ...but global pool membership (separate opt-in) is unchanged
        expect(getGlobalWaitingBuddyRequests().map(r => r.id)).toContain(reqId);
        expect(db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(reqId).status).toBe('waiting');
    });

    test('pausing guest intake removes eligibility, keeps registration', () => {
        enableHub('hub_intake', true);
        enableGlobal('hub_intake');
        expect(getEligibleStudyHubs()).toContain('hub_intake');

        updateGuildSettings('hub_intake', { study_hub_accepts_guests: 0 });

        expect(getEligibleStudyHubs()).not.toContain('hub_intake');
        expect(isStudyHubEnabled('hub_intake')).toBe(true);
    });
});

describe('Existing matching untouched + privacy', () => {
    test('local matching works regardless of hub flags', () => {
        const a = getOrCreateUser('hub_loc_a');
        const b = getOrCreateUser('hub_loc_b');
        enableHub('hub_loc', true);
        enableGlobal('hub_loc');
        makeReq(a.discord_id, 'hub_loc', 'Math', 60, 'silent');
        makeReq(b.discord_id, 'hub_loc', 'Math', 60, 'silent');

        expect(getWaitingBuddyRequests('hub_loc').length).toBe(2);
    });

    test('global opt-in still gates the pool independently of hub', () => {
        const a = getOrCreateUser('hub_g_a');
        enableHub('hub_g', true); // hub on, global off
        makeReq(a.discord_id, 'hub_g');

        expect(getGlobalWaitingBuddyRequests()).toEqual([]);
        expect(getEligibleStudyHubs()).toEqual([]);
    });

    test('eligible hubs expose only guild IDs (no member lists or private data)', () => {
        enableHub('hub_priv_1', true);
        enableGlobal('hub_priv_1');
        enableHub('hub_priv_2', true);
        enableGlobal('hub_priv_2');

        const eligible = getEligibleStudyHubs();
        expect(eligible).toEqual(['hub_priv_1', 'hub_priv_2']);
        for (const entry of eligible) {
            expect(typeof entry).toBe('string');
        }
        const text = JSON.stringify(eligible);
        expect(text).not.toContain('discord_id');
        expect(text).not.toContain('member');
    });
});
