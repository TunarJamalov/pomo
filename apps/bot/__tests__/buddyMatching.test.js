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
    getWaitingBuddyRequests,
    getGlobalWaitingBuddyRequests,
    expireStaleBuddyRequests,
    isBuddyBlocked,
    getActiveSessionForUser,
    createSession,
    matchBuddyPair,
} = require('../utils/database');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

beforeAll(() => initDatabase());
afterAll(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM buddy_requests;');
});

describe('PomoMatch Buddy System', () => {
    test('creates a buddy request', () => {
        const user = getOrCreateUser('user_a');
        const result = createBuddyRequest(user.discord_id, 'guild_1', 'Math', 60, 'silent');
        expect(result).toBeDefined();
        expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    test('returns empty array when no waiting requests', () => {
        const requests = getWaitingBuddyRequests('guild_1');
        expect(requests).toEqual([]);
    });

    test('adds and retrieves waiting requests', () => {
        const user1 = getOrCreateUser('user_1');
        const user2 = getOrCreateUser('user_2');
        createBuddyRequest(user1.discord_id, 'guild_1', 'Math', 60, 'silent');
        createBuddyRequest(user2.discord_id, 'guild_1', 'Math', 60, 'silent');

        const requests = getWaitingBuddyRequests('guild_1');
        expect(requests.length).toBe(2);
        expect(requests[0].subject).toBe('Math');
    });

    test('matchBuddyPair updates both requests atomically', () => {
        const user1 = getOrCreateUser('user_1');
        const user2 = getOrCreateUser('user_2');
        const r1 = createBuddyRequest(user1.discord_id, 'guild_1', 'Math', 60, 'silent');
        const r2 = createBuddyRequest(user2.discord_id, 'guild_1', 'Math', 60, 'silent');

        const result = matchBuddyPair(Number(r1.lastInsertRowid), user2.discord_id, Number(r2.lastInsertRowid), user1.discord_id, 80);
        expect(result).toBe(2);

        const req1 = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(Number(r1.lastInsertRowid));
        expect(req1.status).toBe('matched');
        expect(req1.matched_user_id).toBe(user2.discord_id);
    });

    test('global queue returns waiting requests across opted-in guilds', () => {
        const { getOrCreateGuildSettings, updateGuildSettings } = require('../utils/database');
        const user1 = getOrCreateUser('g_user_1');
        const user2 = getOrCreateUser('g_user_2');
        for (const g of ['guild_A', 'guild_B']) {
            getOrCreateGuildSettings(g);
            updateGuildSettings(g, { global_buddy_matching_enabled: 1 });
        }
        createBuddyRequest(user1.discord_id, 'guild_A', 'Math', 60, 'silent');
        createBuddyRequest(user2.discord_id, 'guild_B', 'Math', 60, 'silent');

        const global = getGlobalWaitingBuddyRequests();
        expect(global.length).toBe(2);

        // Same-guild query stays scoped (local matching preserved)
        expect(getWaitingBuddyRequests('guild_A').length).toBe(1);
        expect(getWaitingBuddyRequests('guild_B').length).toBe(1);
        expect(getWaitingBuddyRequests('guild_C')).toEqual([]);
    });

    test('stale requests are excluded and expireStaleBuddyRequests marks them expired', () => {
        const user = getOrCreateUser('stale_user');
        const r = createBuddyRequest(user.discord_id, 'guild_1', 'Math', 60, 'silent');
        db.prepare("UPDATE buddy_requests SET created_at = datetime('now', '-61 minutes') WHERE id = ?")
            .run(Number(r.lastInsertRowid));

        expect(getGlobalWaitingBuddyRequests()).toEqual([]);
        expect(getWaitingBuddyRequests('guild_1')).toEqual([]);

        const res = expireStaleBuddyRequests();
        expect(res.changes).toBe(1);
        const row = db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(Number(r.lastInsertRowid));
        expect(row.status).toBe('expired');
    });

    test('isBuddyBlocked detects blocks in both directions', () => {
        expect(isBuddyBlocked('ga', 'gb')).toBe(false);
        db.prepare('INSERT INTO buddy_blocks (blocker_id, blocked_id) VALUES (?, ?)').run('ga', 'gb');
        expect(isBuddyBlocked('ga', 'gb')).toBe(true);
        expect(isBuddyBlocked('gb', 'ga')).toBe(true);
        expect(isBuddyBlocked('ga', 'gc')).toBe(false);
        db.exec("DELETE FROM buddy_blocks;");
    });

    test('only one waiting request per user survives re-queue', () => {
        const user = getOrCreateUser('single_user');
        createBuddyRequest(user.discord_id, 'guild_1', 'Math', 60, 'silent');
        // Command flow cancels previous waiting before creating a new one
        db.prepare("UPDATE buddy_requests SET status = 'cancelled', ended_at = datetime('now') WHERE user_id = ? AND status = 'waiting'").run(user.discord_id);
        createBuddyRequest(user.discord_id, 'guild_1', 'Physics', 45, 'voice');

        const waiting = db.prepare("SELECT * FROM buddy_requests WHERE user_id = ? AND status = 'waiting'").all(user.discord_id);
        expect(waiting.length).toBe(1);
        expect(waiting[0].subject).toBe('Physics');
    });

    test('getActiveSessionForUser detects users in active sessions', () => {
        const user = getOrCreateUser('busy_user');
        expect(getActiveSessionForUser(user.discord_id)).toBeFalsy();
        createSession(user.discord_id, 'guild_1', 'chan_1', 'msg_1', 25, 'Study');
        expect(getActiveSessionForUser(user.discord_id)).toBeTruthy();
        db.exec("DELETE FROM study_sessions WHERE user_id = 'busy_user';");
    });

    test('matchBuddyPair fails if request already matched (atomic)', () => {
        const user1 = getOrCreateUser('user_1');
        const user2 = getOrCreateUser('user_2');
        const user3 = getOrCreateUser('user_3');
        const r1 = createBuddyRequest(user1.discord_id, 'guild_1', 'Math', 60, 'silent');
        const r2 = createBuddyRequest(user2.discord_id, 'guild_1', 'Math', 60, 'silent');
        const r3 = createBuddyRequest(user3.discord_id, 'guild_1', 'Math', 60, 'silent');

        // First match succeeds
        matchBuddyPair(Number(r1.lastInsertRowid), user2.discord_id, Number(r2.lastInsertRowid), user1.discord_id, 80);

        // Second match on same request should fail
        const result = matchBuddyPair(Number(r1.lastInsertRowid), user3.discord_id, Number(r3.lastInsertRowid), user1.discord_id, 80);
        expect(result).toBe(0);
    });
});


