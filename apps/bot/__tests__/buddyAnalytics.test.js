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
    createSession,
    completeSession,
    matchBuddyPair,
    recordBuddySwipe,
    recordBuddyEvent,
    getBuddyFunnelStats,
    BUDDY_EVENT_NAMES,
    buddyMatchKey,
} = require('../utils/database');
const { handleBuddyLike } = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_analytics_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

beforeAll(() => initDatabase());
afterAll(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM buddy_analytics_events;');
    db.exec('DELETE FROM buddy_swipes;');
    db.exec('DELETE FROM buddy_blocks;');
    db.exec('DELETE FROM buddy_reports;');
    db.exec('DELETE FROM buddy_unmatches;');
    db.exec('DELETE FROM buddy_hub_consents;');
    db.exec('DELETE FROM buddy_hub_invites;');
    db.exec('DELETE FROM buddy_requests;');
    db.exec('DELETE FROM study_sessions;');
});

function makeReq(userId, guildId = 'guild_1', subject = 'Math', duration = 60, mode = 'silent') {
    const r = createBuddyRequest(userId, guildId, subject, duration, mode);
    return Number(r.lastInsertRowid);
}

function eventCount(name, extraWhere = '', params = []) {
    return db.prepare(
        `SELECT COUNT(*) AS c FROM buddy_analytics_events WHERE event_name = ? ${extraWhere}`
    ).get(name, ...params).c;
}

// Fake Discord client (mirrors buddyLikeNotify.test.js conventions).
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
                            if (failSendFor.has(id)) throw new Error('Cannot send messages to this user');
                            sent.push({ to: id, msg });
                        },
                    }),
                };
            },
        },
    };
    return client;
}

function makeButtonInteraction({ userId, guildId = 'guild_1', client }) {
    const calls = { updates: [], followUps: [] };
    return {
        calls,
        user: { id: userId, username: 'Liker_' + userId },
        guildId,
        client,
        update: async (payload) => { calls.updates.push(payload); },
        followUp: async (payload) => { calls.followUps.push(payload); },
    };
}

describe('Event creation', () => {
    test('all 16 stable event names are accepted', () => {
        expect(BUDDY_EVENT_NAMES).toHaveLength(16);
        for (const name of BUDDY_EVENT_NAMES) {
            expect(recordBuddyEvent(name, { userId: 'u1', guildId: 'g1' })).toBe(true);
        }
        for (const name of BUDDY_EVENT_NAMES) {
            expect(eventCount(name)).toBe(1);
        }
    });

    test('unknown event names are rejected without throwing', () => {
        expect(recordBuddyEvent('buddy_hacked', { userId: 'u1' })).toBe(false);
        expect(recordBuddyEvent('', { userId: 'u1' })).toBe(false);
        expect(recordBuddyEvent(null)).toBe(false);
        expect(recordBuddyEvent(undefined)).toBe(false);
        expect(eventCount('buddy_hacked')).toBe(0);
    });

    test('recordBuddyEvent never throws on garbage input', () => {
        expect(() => recordBuddyEvent('buddy_like', null)).not.toThrow();
        expect(() => recordBuddyEvent('buddy_like', { userId: 42, guildId: {}, requestId: 'x' })).not.toThrow();
        expect(() => recordBuddyEvent('buddy_like')).not.toThrow();
    });
});

describe('Privacy-safe payloads', () => {
    test('stored rows contain only allowed columns, no personal content', () => {
        recordBuddyEvent('buddy_like', {
            userId: 'secret_user_1',
            guildId: 'secret_guild_9',
            requestId: 123,
            matchKey: '1:2',
            scope: 'global',
            subject: 'Math',
            message: 'hello there',
            email: 'a@b.c',
        });

        const row = db.prepare('SELECT * FROM buddy_analytics_events LIMIT 1').get();
        const keys = Object.keys(row).sort();
        expect(keys).toEqual(
            ['created_at', 'event_name', 'guild_id', 'id', 'match_key', 'request_id', 'scope', 'user_id'].sort()
        );
        const text = JSON.stringify(row);
        expect(text).not.toContain('Math');
        expect(text).not.toContain('hello there');
        expect(text).not.toContain('a@b.c');
    });

    test('invalid scope/matchKey/requestId normalize to NULL', () => {
        recordBuddyEvent('buddy_like', {
            userId: 'u1',
            scope: 'interdimensional',
            matchKey: 'not-a-key',
            requestId: 'abc',
        });
        const row = db.prepare('SELECT * FROM buddy_analytics_events LIMIT 1').get();
        expect(row.scope).toBeNull();
        expect(row.match_key).toBeNull();
        expect(row.request_id).toBeNull();
    });
});

describe('Funnel calculations', () => {
    test('counts and rates across a scripted funnel', () => {
        const a = getOrCreateUser('f_a');
        const b = getOrCreateUser('f_b');
        const reqA = makeReq(a.discord_id, 'guild_1');
        const reqB = makeReq(b.discord_id, 'guild_1');

        recordBuddyEvent('buddy_request_created', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA });
        recordBuddyEvent('buddy_request_created', { userId: b.discord_id, guildId: 'guild_1', requestId: reqB });
        recordBuddyEvent('buddy_candidate_shown', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA, scope: 'local' });
        recordBuddyEvent('buddy_candidate_shown', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA, scope: 'local' });
        recordBuddyEvent('buddy_like', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA, scope: 'local' });
        recordBuddyEvent('buddy_like', { userId: b.discord_id, guildId: 'guild_1', requestId: reqB, scope: 'local' });
        const key = buddyMatchKey(reqA, reqB);
        recordBuddyEvent('buddy_match_created', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA, matchKey: key, scope: 'local' });
        recordBuddyEvent('buddy_destination_selected', { userId: a.discord_id, guildId: 'guild_1', requestId: reqA, matchKey: key });
        recordBuddyEvent('buddy_destination_confirmed', { userId: b.discord_id, guildId: 'guild_1', requestId: reqB, matchKey: key });

        const s = getBuddyFunnelStats({ days: 7 });
        expect(s.requests).toBe(2);
        expect(s.requestingUsers).toBe(2);
        expect(s.candidatesShown).toBe(2);
        expect(s.likes).toBe(2);
        expect(s.matches).toBe(1);
        expect(s.matchedUsers).toBe(1);
        expect(s.localMatches).toBe(1);
        expect(s.globalMatches).toBe(0);
        expect(s.destinationsSelected).toBe(1);
        expect(s.destinationsConfirmed).toBe(1);
        expect(s.rates.likeRate).toBe(100);
        expect(s.rates.matchRate).toBe(50);
        expect(s.rates.destinationRate).toBe(100);
        expect(s.rates.confirmRate).toBe(100);
        expect(s.rates.globalShare).toBe(0);
    });

    test('empty funnel yields zeros, not NaN', () => {
        const s = getBuddyFunnelStats({ days: 7 });
        expect(s.requests).toBe(0);
        for (const v of Object.values(s.rates)) {
            expect(v).toBe(0);
        }
    });

    test('local vs global matches separated', () => {
        const a = getOrCreateUser('lg_a');
        const b = getOrCreateUser('lg_b');
        const c = getOrCreateUser('lg_c');
        const d = getOrCreateUser('lg_d');
        const r1 = makeReq(a.discord_id, 'guild_1');
        const r2 = makeReq(b.discord_id, 'guild_1');
        const r3 = makeReq(c.discord_id, 'guild_1');
        const r4 = makeReq(d.discord_id, 'guild_2');

        recordBuddyEvent('buddy_match_created', {
            userId: a.discord_id, guildId: 'guild_1', requestId: r1,
            matchKey: buddyMatchKey(r1, r2), scope: 'local',
        });
        recordBuddyEvent('buddy_match_created', {
            userId: c.discord_id, guildId: 'guild_1', requestId: r3,
            matchKey: buddyMatchKey(r3, r4), scope: 'global',
        });

        const s = getBuddyFunnelStats({ days: 30 });
        expect(s.matches).toBe(2);
        expect(s.localMatches).toBe(1);
        expect(s.globalMatches).toBe(1);
        expect(s.rates.globalShare).toBe(50);
    });
});

describe('Time windows', () => {
    test('old events excluded from 7d, included in 30d and all-time', () => {
        recordBuddyEvent('buddy_request_created', { userId: 'tw_u', guildId: 'g1' });
        db.prepare("UPDATE buddy_analytics_events SET created_at = datetime('now', '-10 days')").run();

        expect(getBuddyFunnelStats({ days: 7 }).requests).toBe(0);
        expect(getBuddyFunnelStats({ days: 30 }).requests).toBe(1);
        expect(getBuddyFunnelStats({ days: 0 }).requests).toBe(1);
        expect(getBuddyFunnelStats({}).requests).toBe(0); // default window is 7d
    });

    test('invalid day values clamp to 7d', () => {
        recordBuddyEvent('buddy_request_created', { userId: 'tw2_u', guildId: 'g1' });
        expect(getBuddyFunnelStats({ days: 999 }).requests).toBe(1);
        expect(getBuddyFunnelStats({ days: -3 }).requests).toBe(1);
        expect(getBuddyFunnelStats({ days: 'all' }).window.days).toBe(7);
    });
});

describe('Guild scoping (server admin stats)', () => {
    test('events are isolated per server', () => {
        recordBuddyEvent('buddy_request_created', { userId: 'gs_a', guildId: 'guild_A' });
        recordBuddyEvent('buddy_request_created', { userId: 'gs_b', guildId: 'guild_B' });
        recordBuddyEvent('buddy_like', { userId: 'gs_a', guildId: 'guild_A' });

        const a = getBuddyFunnelStats({ days: 7, guildId: 'guild_A' });
        expect(a.requests).toBe(1);
        expect(a.likes).toBe(1);
        expect(a.window.guildId).toBe('guild_A');

        const b = getBuddyFunnelStats({ days: 7, guildId: 'guild_B' });
        expect(b.requests).toBe(1);
        expect(b.likes).toBe(0);

        expect(getBuddyFunnelStats({ days: 7 }).requests).toBe(2);
    });
});

describe('Study Hub metrics', () => {
    test('consent and invite outcomes counted separately', () => {
        recordBuddyEvent('buddy_hub_consent_accepted', { userId: 'h_a', guildId: 'g1' });
        recordBuddyEvent('buddy_hub_consent_accepted', { userId: 'h_b', guildId: 'g1' });
        recordBuddyEvent('buddy_hub_consent_declined', { userId: 'h_c', guildId: 'g1' });
        recordBuddyEvent('buddy_hub_invite_sent', { userId: 'h_a', guildId: 'g1' });
        recordBuddyEvent('buddy_hub_invite_failed', { userId: 'h_b', guildId: 'g1' });

        const s = getBuddyFunnelStats({ days: 7 });
        expect(s.consentsAccepted).toBe(2);
        expect(s.consentsDeclined).toBe(1);
        expect(s.invitesSent).toBe(1);
        expect(s.invitesFailed).toBe(1);
        expect(s.rates.consentRate).toBe(66.7);
        expect(s.rates.inviteSuccessRate).toBe(50);
    });
});

describe('Session conversion via match tagging', () => {
    test('matched user sessions are tagged and counted; breaks excluded', () => {
        const a = getOrCreateUser('sc_a');
        const b = getOrCreateUser('sc_b');
        const reqA = makeReq(a.discord_id, 'guild_1');
        const reqB = makeReq(b.discord_id, 'guild_1');
        expect(matchBuddyPair(reqA, b.discord_id, reqB, a.discord_id, 80)).toBe(2);

        const sessionId = createSession(a.discord_id, 'guild_1', 'chan', null, 25, 'Study');
        const row = db.prepare('SELECT buddy_match_key FROM study_sessions WHERE id = ?').get(sessionId);
        expect(row.buddy_match_key).toBe(buddyMatchKey(reqA, reqB));
        expect(eventCount('buddy_study_session_started')).toBe(1);

        completeSession(sessionId);
        expect(eventCount('buddy_study_session_completed')).toBe(1);

        const s = getBuddyFunnelStats({ days: 7 });
        expect(s.sessionsStarted).toBe(1);
        expect(s.sessionsCompleted).toBe(1);
        expect(s.rates.completionRate).toBe(100);
    });

    test('break sessions and unmatched users produce no events', () => {
        const plain = getOrCreateUser('sc_plain');
        createSession(plain.discord_id, 'guild_1', 'chan', null, 5, '__break__');

        const a = getOrCreateUser('sc_nomatch');
        const sid = createSession(a.discord_id, 'guild_1', 'chan', null, 25, 'Study');
        completeSession(sid);

        expect(eventCount('buddy_study_session_started')).toBe(0);
        expect(eventCount('buddy_study_session_completed')).toBe(0);
        const tag = db.prepare('SELECT buddy_match_key FROM study_sessions WHERE id = ?').get(sid);
        expect(tag.buddy_match_key).toBeNull();
    });
});

describe('Repeat usage', () => {
    test('users with 2+ requests counted once as repeat', () => {
        const a = getOrCreateUser('rp_a');
        const b = getOrCreateUser('rp_b');
        makeReq(a.discord_id);
        db.prepare("UPDATE buddy_requests SET status = 'cancelled' WHERE user_id = ?").run(a.discord_id);
        makeReq(a.discord_id);
        makeReq(b.discord_id);

        recordBuddyEvent('buddy_request_created', { userId: a.discord_id });
        recordBuddyEvent('buddy_request_created', { userId: a.discord_id });
        recordBuddyEvent('buddy_request_created', { userId: b.discord_id });

        const s = getBuddyFunnelStats({ days: 30 });
        expect(s.requestingUsers).toBe(2);
        expect(s.repeatUsers).toBe(1);
    });
});

describe('Analytics failure never breaks matching', () => {
    test('handler flow works end-to-end and records events', async () => {
        const a = getOrCreateUser('fl_a');
        const b = getOrCreateUser('fl_b');
        const reqA = makeReq(a.discord_id, 'guild_1', 'Math', 60, 'silent');
        const reqB = makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');
        const client = makeClient();
        const ix = makeButtonInteraction({ userId: a.discord_id, client });

        await handleBuddyLike(ix, reqB, reqA);

        expect(eventCount('buddy_like')).toBe(1);
        const row = db.prepare('SELECT scope FROM buddy_analytics_events WHERE event_name = ?').get('buddy_like');
        expect(row.scope).toBe('local');
    });

    test('matching still works when the events table is gone', async () => {
        const a = getOrCreateUser('fl2_a');
        const b = getOrCreateUser('fl2_b');
        const reqA = makeReq(a.discord_id, 'guild_1', 'Math', 60, 'silent');
        const reqB = makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');

        db.exec('DROP TABLE buddy_analytics_events;');

        const client = makeClient();
        const ix = makeButtonInteraction({ userId: a.discord_id, client });
        let threw = false;
        try {
            await handleBuddyLike(ix, reqB, reqA);
        } catch (_) {
            threw = true;
        }

        expect(threw).toBe(false);
        // Like itself still recorded (swipe table untouched by the failure)
        const swipe = db.prepare('SELECT * FROM buddy_swipes WHERE swiper_id = ?').get(a.discord_id);
        expect(swipe).toBeTruthy();
        expect(ix.calls.followUps.length).toBeGreaterThan(0);

        // Restore for a clean shutdown (isolated DB is deleted afterwards anyway)
        initDatabase();
        expect(recordBuddyEvent('buddy_like', { userId: a.discord_id })).toBe(true);
    });
});
