const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const {
    db,
    initDatabase,
    getOrCreateUser,
    createBuddyRequest,
    matchBuddyPair,
    unmatchBuddyPair,
    blockBuddyUser,
    normalizeBuddyDestination,
    setBuddyDestination,
    getMatchDestinationState,
} = require('../utils/database');
const {
    handleBuddyDestination,
    buildDestinationRow,
} = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_dest_${Date.now()}.db`);
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

function makeMatchedPair(aId, bId, guildA = 'guild_1', guildB = 'guild_1') {
    const a = getOrCreateUser(aId);
    const b = getOrCreateUser(bId);
    const reqA = makeReq(a.discord_id, guildA);
    const reqB = makeReq(b.discord_id, guildB);
    const matched = matchBuddyPair(reqA, b.discord_id, reqB, a.discord_id, 80);
    expect(matched).toBe(2);
    return { a: a.discord_id, b: b.discord_id, reqA, reqB };
}

function makeClient({ fetchable = null, failSendFor = new Set() } = {}) {
    const sent = [];
    const client = {
        sent,
        users: {
            fetch: async (id) => {
                if (fetchable && !fetchable.has(id)) return null;
                return {
                    id,
                    username: 'User_' + id,
                    createDM: async () => ({
                        send: async (msg) => {
                            const text = typeof msg === 'string' ? msg : (msg.content || '');
                            if (failSendFor.has(id)) throw new Error('Cannot send messages to this user');
                            sent.push({ to: id, msg: text, raw: msg });
                        },
                    }),
                };
            },
        },
    };
    return client;
}

function makeIx({ userId, guildId = 'guild_1', client, username = null }) {
    const calls = { updates: [], followUps: [], replies: [] };
    return {
        calls,
        user: { id: userId, username: username || ('Ix_' + userId) },
        guildId,
        client: client || makeClient(),
        update: async (payload) => { calls.updates.push(payload); },
        followUp: async (payload) => { calls.followUps.push(payload); },
        reply: async (payload) => { calls.replies.push(payload); },
    };
}

function dmsTo(client, userId) {
    return client.sent.filter(s => s.to === userId);
}

describe('Destination state model', () => {
    test('new requests default to pending', () => {
        const { reqA } = makeMatchedPair('dflt_a', 'dflt_b');
        const row = db.prepare('SELECT destination FROM buddy_requests WHERE id = ?').get(reqA);
        expect(row.destination).toBe('pending');
    });

    test('legacy NULL destination reads as pending, set still works', () => {
        const { a, b, reqA } = makeMatchedPair('nul_a', 'nul_b');
        db.prepare('UPDATE buddy_requests SET destination = NULL WHERE id = ?').run(reqA);

        const state = getMatchDestinationState(reqA, a);
        expect(state.ok).toBe(true);
        expect(state.myChoice).toBe('pending');
        expect(state.confirmed).toBe(false);

        expect(setBuddyDestination(reqA, a, 'own_server')).toEqual({ ok: true, choice: 'own_server' });
        expect(getMatchDestinationState(reqA, a).myChoice).toBe('own_server');
        void b;
    });

    test('normalizeBuddyDestination accepts only known values', () => {
        const { normalizeBuddyDestination: norm } = require('../utils/database');
        expect(norm('own_server')).toBe('own_server');
        expect(norm(' Study_Hub ')).toBe('study_hub');
        expect(norm('INDEPENDENT')).toBe('independent');
        expect(norm('pending')).toBe('pending');
        expect(norm('hub')).toBeNull();
        expect(norm('')).toBeNull();
        expect(norm(null)).toBeNull();
        expect(norm(42)).toBeNull();
    });

    test('each destination type persists per user independently', () => {
        for (const choice of ['own_server', 'study_hub', 'independent']) {
            const { a, b, reqA } = makeMatchedPair(`ind_a_${choice}`, `ind_b_${choice}`);
            expect(setBuddyDestination(reqA, a, choice)).toEqual({ ok: true, choice });

            const state = getMatchDestinationState(reqA, a);
            expect(state.ok).toBe(true);
            expect(state.myChoice).toBe(choice);
            expect(state.partnerChoice).toBe('pending');
            expect(state.confirmed).toBe(false);
            expect(state.partnerId).toBe(b);
            void b;
        }
    });

    test('both same choice confirms (all three types)', () => {
        for (const choice of ['own_server', 'study_hub', 'independent']) {
            const { a, b, reqA, reqB } = makeMatchedPair(`cf_a_${choice}`, `cf_b_${choice}`);
            expect(setBuddyDestination(reqA, a, choice).ok).toBe(true);
            expect(setBuddyDestination(reqB, b, choice).ok).toBe(true);

            const state = getMatchDestinationState(reqA, a);
            expect(state.confirmed).toBe(true);
            expect(state.confirmedChoice).toBe(choice);
        }
    });

    test('different choices do not confirm', () => {
        const { a, b, reqA, reqB } = makeMatchedPair('dif_a', 'dif_b');
        setBuddyDestination(reqA, a, 'study_hub');
        setBuddyDestination(reqB, b, 'independent');

        const stateA = getMatchDestinationState(reqA, a);
        expect(stateA.myChoice).toBe('study_hub');
        expect(stateA.partnerChoice).toBe('independent');
        expect(stateA.confirmed).toBe(false);
        expect(stateA.confirmedChoice).toBeNull();
        void b;
    });

    test('changing choice invalidates previous confirmation', () => {
        const { a, b, reqA, reqB } = makeMatchedPair('chg_a', 'chg_b');
        setBuddyDestination(reqA, a, 'study_hub');
        setBuddyDestination(reqB, b, 'study_hub');
        expect(getMatchDestinationState(reqA, a).confirmed).toBe(true);

        setBuddyDestination(reqA, a, 'independent');
        const state = getMatchDestinationState(reqA, a);
        expect(state.myChoice).toBe('independent');
        expect(state.partnerChoice).toBe('study_hub');
        expect(state.confirmed).toBe(false);
        void b;
    });

    test('invalid choice and foreign rows rejected', () => {
        const { a, reqA } = makeMatchedPair('inv_a', 'inv_b');
        expect(setBuddyDestination(reqA, a, 'moon_base')).toEqual({ ok: false, reason: 'invalid_choice' });
        expect(setBuddyDestination(reqA, a, 'pending')).toEqual({ ok: false, reason: 'invalid_choice' });
        expect(setBuddyDestination(999999, a, 'own_server')).toEqual({ ok: false, reason: 'no_active_match' });
        // Someone else's request id
        expect(setBuddyDestination(reqA, 'stranger_x', 'own_server')).toEqual({ ok: false, reason: 'no_active_match' });
    });
});

describe('Destination handler validation', () => {
    test('ended match cannot select destination', async () => {
        const { a, reqA } = makeMatchedPair('end_a', 'end_b');
        unmatchBuddyPair(a, reqA);

        const ix = makeIx({ userId: a, client: makeClient() });
        await handleBuddyDestination(ix, 'own_server', reqA);

        expect(ix.calls.replies.length).toBe(1);
        expect(ix.calls.updates.length).toBe(0);
        expect(JSON.stringify(ix.calls.replies)).toContain('Match Ended');
    });

    test('forged interaction (wrong owner) rejected', async () => {
        const { reqA } = makeMatchedPair('frg_a', 'frg_b');
        const ix = makeIx({ userId: 'intruder_z', client: makeClient() });
        await handleBuddyDestination(ix, 'own_server', reqA);

        expect(ix.calls.replies.length).toBe(1);
        expect(JSON.stringify(ix.calls.replies)).toContain('Match Ended');
    });

    test('invalid choice string rejected', async () => {
        const { a, reqA } = makeMatchedPair('bad_a', 'bad_b');
        const ix = makeIx({ userId: a, client: makeClient() });
        await handleBuddyDestination(ix, 'moon_base', reqA);

        expect(ix.calls.replies.length).toBe(1);
        expect(JSON.stringify(ix.calls.replies)).toContain('Invalid Choice');
        const row = db.prepare('SELECT destination FROM buddy_requests WHERE id = ?').get(reqA);
        expect(row.destination).toBe('pending');
    });

    test('blocked users cannot interact', async () => {
        const { a, b, reqA } = makeMatchedPair('blk_a', 'blk_b');
        db.prepare('INSERT INTO buddy_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(a, b);

        const ix = makeIx({ userId: a, client: makeClient() });
        await handleBuddyDestination(ix, 'own_server', reqA);

        expect(ix.calls.replies.length).toBe(1);
        expect(JSON.stringify(ix.calls.replies)).toContain('Unavailable');
        const row = db.prepare('SELECT destination FROM buddy_requests WHERE id = ?').get(reqA);
        expect(row.destination).toBe('pending');
        void b;
    });

    test('study_hub choice rejected when no eligible hubs exist', async () => {
        const { a, reqA } = makeMatchedPair('noh_a', 'noh_b');
        const ix = makeIx({ userId: a, client: makeClient() });
        await handleBuddyDestination(ix, 'study_hub', reqA);

        expect(ix.calls.replies.length).toBe(1);
        expect(JSON.stringify(ix.calls.replies)).toContain('No Study Hubs');
        const row = db.prepare('SELECT destination FROM buddy_requests WHERE id = ?').get(reqA);
        expect(row.destination).toBe('pending');
    });
});

describe('Destination agreement flow (handler level)', () => {
    test('first choice shows pending, notifies partner, no confirm', async () => {
        const { a, b, reqA } = makeMatchedPair('flw_a', 'flw_b');
        const client = makeClient();
        const ix = makeIx({ userId: a, client });

        await handleBuddyDestination(ix, 'own_server', reqA);

        expect(ix.calls.updates.length).toBe(1);
        expect(JSON.stringify(ix.calls.updates)).toContain('Waiting for your partner');
        const toB = dmsTo(client, b);
        expect(toB.length).toBe(1);
        expect(toB[0].msg).toContain('My Server');
        const row = db.prepare('SELECT destination FROM buddy_requests WHERE id = ?').get(reqA);
        expect(row.destination).toBe('own_server');
    });

    test('matching second choice confirms for both, no invite sent', async () => {
        const { a, b, reqA, reqB } = makeMatchedPair('cfh_a', 'cfh_b');
        const client = makeClient();

        // Enable a hub first so study_hub choices pass the gate
        const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
        getOrCreateGuildSettings('guild_1');
        updateGuildSettings('guild_1', { global_buddy_matching_enabled: 1, study_hub_enabled: 1, study_hub_accepts_guests: 1 });

        await handleBuddyDestination(makeIx({ userId: a, client }), 'study_hub', reqA);

        const ixB = makeIx({ userId: b, client });
        await handleBuddyDestination(ixB, 'study_hub', reqB);

        expect(JSON.stringify(ixB.calls.updates)).toContain('Destination confirmed');
        expect(JSON.stringify(ixB.calls.updates)).toContain('Study Hub');

        // No invite / movement anywhere in any DM
        const allText = client.sent.map(s => s.msg).join('\n');
        expect(allText).not.toContain('discord.gg');
        expect(allText).not.toContain('discord.com/invite');
        expect(allText.toLowerCase()).not.toContain('you have been moved');

        // State confirms from both sides
        expect(getMatchDestinationState(reqB, b).confirmed).toBe(true);
        expect(getMatchDestinationState(reqA, a).confirmed).toBe(true);
    });

    test('change after confirm notifies partner and un-confirms', async () => {
        const { a, b, reqA, reqB } = makeMatchedPair('chg2_a', 'chg2_b');
        const client = makeClient();
        const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
        getOrCreateGuildSettings('guild_1');
        updateGuildSettings('guild_1', { global_buddy_matching_enabled: 1, study_hub_enabled: 1, study_hub_accepts_guests: 1 });

        await handleBuddyDestination(makeIx({ userId: a, client }), 'study_hub', reqA);
        await handleBuddyDestination(makeIx({ userId: b, client }), 'study_hub', reqB);
        expect(getMatchDestinationState(reqA, a).confirmed).toBe(true);

        const dmsBefore = dmsTo(client, b).length;
        await handleBuddyDestination(makeIx({ userId: a, client }), 'independent', reqA);

        expect(getMatchDestinationState(reqA, a).confirmed).toBe(false);
        const newDms = dmsTo(client, b).slice(dmsBefore);
        expect(newDms.length).toBe(1);
        expect(newDms[0].msg).toContain('Independently');
    });
});

describe('Destination UI gating', () => {
    test('Study Hub button hidden when no eligible hubs exist', () => {
        const payload = buildDestinationRow(123, false);
        const text = JSON.stringify(payload);
        expect(text).toContain('buddy_dest_own_server_123');
        expect(text).toContain('buddy_dest_independent_123');
        expect(text).not.toContain('buddy_dest_study_hub_');
    });

    test('Study Hub button present when eligible hubs exist', () => {
        const payload = buildDestinationRow(456, true);
        const text = JSON.stringify(payload);
        expect(text).toContain('buddy_dest_study_hub_456');
    });

    test('destination buttons carry request ids only, no user ids', () => {
        const payload = buildDestinationRow(789, true);
        const text = JSON.stringify(payload);
        expect(text).not.toContain('secret_user_1');
        expect(text).not.toContain('<@');
    });
});
