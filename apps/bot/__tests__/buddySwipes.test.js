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
    getGlobalWaitingBuddyRequests,
    expireStaleBuddyRequests,
    isBuddyBlocked,
    blockBuddyUser,
    recordBuddySwipe,
    hasBuddyLiked,
    getBuddyActedUserIds,
    matchBuddyPair,
} = require('../utils/database');
const {
    scoreBuddyMatch,
    findBestCandidate,
} = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_swipes_${Date.now()}.db`);
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
    db.exec('DELETE FROM buddy_requests;');
});

function makeReq(userId, guildId = 'guild_1', subject = 'Math', duration = 60, mode = 'silent') {
    const r = createBuddyRequest(userId, guildId, subject, duration, mode);
    return Number(r.lastInsertRowid);
}

describe('Buddy Like / Pass (buddy_swipes)', () => {
    test('record like persists; duplicate like ignored (single row)', () => {
        const a = getOrCreateUser('like_a');
        const b = getOrCreateUser('like_b');
        const reqB = makeReq(b.discord_id);

        const first = recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'like');
        expect(first.created).toBe(true);

        const dup = recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'like');
        expect(dup.created).toBe(false);

        const rows = db.prepare('SELECT * FROM buddy_swipes WHERE swiper_id = ?').all(a.discord_id);
        expect(rows.length).toBe(1);
        expect(rows[0].action).toBe('like');
    });

    test('invalid action and self-like rejected', () => {
        const a = getOrCreateUser('self_a');
        expect(recordBuddySwipe(a.discord_id, a.discord_id, 999, 'like').created).toBe(false);
        expect(recordBuddySwipe(a.discord_id, 'other', 999, 'superlike').created).toBe(false);
        expect(db.prepare('SELECT COUNT(*) AS c FROM buddy_swipes').get().c).toBe(0);
    });

    test('pass recorded and visible in acted list', () => {
        const a = getOrCreateUser('pass_a');
        const b = getOrCreateUser('pass_b');
        const reqB = makeReq(b.discord_id);

        expect(recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'pass').created).toBe(true);
        expect(getBuddyActedUserIds(a.discord_id)).toContain(b.discord_id);
        expect(hasBuddyLiked(a.discord_id, b.discord_id)).toBe(false);
    });

    test('passed candidate skipped by queue; next compatible shown', () => {
        const a = getOrCreateUser('q_a');
        const b = getOrCreateUser('q_b');
        const c = getOrCreateUser('q_c');
        const reqA = makeReq(a.discord_id, 'guild_1', 'Math', 60, 'silent');
        const reqB = makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');
        makeReq(c.discord_id, 'guild_1', 'Math', 60, 'silent');

        recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'pass');

        const { candidate, score } = findBestCandidate({
            userId: a.discord_id,
            myRequestId: reqA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'guild_1',
            excludeUserIds: new Set(getBuddyActedUserIds(a.discord_id)),
        });

        expect(candidate).toBeTruthy();
        expect(candidate.user_id).toBe(c.discord_id);
        expect(score).toBeGreaterThanOrEqual(50);
    });

    test('incompatible score stays below threshold (scoring preserved)', () => {
        const a = getOrCreateUser('s_a');
        const b = getOrCreateUser('s_b');
        makeReq(a.discord_id, 'guild_1', 'Physics', 45, 'voice');
        makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');

        const { score } = findBestCandidate({
            userId: b.discord_id,
            myRequestId: -1,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'guild_1',
            excludeUserIds: new Set(),
        });
        // |45-60|=15 → +30 only; subject differ, mode differ
        expect(score).toBe(30);
        expect(score).toBeLessThan(50);
    });
});

describe('Buddy mutual match', () => {
    test('both likes + current requests → atomic match (2 changes)', () => {
        const a = getOrCreateUser('m_a');
        const b = getOrCreateUser('m_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);

        recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'like');
        recordBuddySwipe(b.discord_id, a.discord_id, reqA, 'like');

        expect(hasBuddyLiked(a.discord_id, b.discord_id)).toBe(true);
        expect(hasBuddyLiked(b.discord_id, a.discord_id)).toBe(true);

        const result = matchBuddyPair(reqA, b.discord_id, reqB, a.discord_id, 80);
        expect(result).toBe(2);

        const rowA = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(reqA);
        const rowB = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(reqB);
        expect(rowA.status).toBe('matched');
        expect(rowB.status).toBe('matched');
        expect(rowA.matched_user_id).toBe(b.discord_id);
        expect(rowB.matched_user_id).toBe(a.discord_id);
    });

    test('one-sided like does not match', () => {
        const a = getOrCreateUser('o_a');
        const b = getOrCreateUser('o_b');
        const reqB = makeReq(b.discord_id);

        recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'like');
        expect(hasBuddyLiked(b.discord_id, a.discord_id)).toBe(false);

        const rowB = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(reqB);
        expect(rowB.status).toBe('waiting');
    });

    test('match fails atomically when candidate left queue (no partial)', () => {
        const a = getOrCreateUser('p_a');
        const b = getOrCreateUser('p_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);

        recordBuddySwipe(a.discord_id, b.discord_id, reqB, 'like');
        recordBuddySwipe(b.discord_id, a.discord_id, reqA, 'like');

        // B leaves before finalize
        db.prepare("UPDATE buddy_requests SET status = 'cancelled' WHERE id = ?").run(reqB);

        const result = matchBuddyPair(reqA, b.discord_id, reqB, a.discord_id, 80);
        expect(result).toBe(0);

        const rowA = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(reqA);
        expect(rowA.status).toBe('waiting');
    });
});

describe('Buddy block in queue', () => {
    test('blocked user excluded from candidates in both directions', () => {
        const a = getOrCreateUser('bl_a');
        const b = getOrCreateUser('bl_b');
        const reqA = makeReq(a.discord_id, 'guild_1', 'Math', 60, 'silent');
        makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');

        expect(blockBuddyUser(a.discord_id, b.discord_id).created).toBe(true);
        expect(isBuddyBlocked(a.discord_id, b.discord_id)).toBe(true);
        expect(isBuddyBlocked(b.discord_id, a.discord_id)).toBe(true);

        const fwd = findBestCandidate({
            userId: a.discord_id,
            myRequestId: reqA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'guild_1',
            excludeUserIds: new Set(),
        });
        expect(fwd.candidate).toBeNull();

        // Duplicate block ignored
        expect(blockBuddyUser(a.discord_id, b.discord_id).created).toBe(false);
    });

    test('self-block rejected', () => {
        const a = getOrCreateUser('sbl_a');
        expect(blockBuddyUser(a.discord_id, a.discord_id).created).toBe(false);
    });
});

describe('Buddy queue staleness', () => {
    test('expired requests never surface as candidates', () => {
        const a = getOrCreateUser('st_a');
        const b = getOrCreateUser('st_b');
        const reqA = makeReq(a.discord_id, 'guild_1', 'Math', 60, 'silent');
        const reqB = makeReq(b.discord_id, 'guild_1', 'Math', 60, 'silent');
        db.prepare("UPDATE buddy_requests SET created_at = datetime('now', '-61 minutes') WHERE id = ?").run(reqB);

        expect(getGlobalWaitingBuddyRequests().map(r => r.id)).not.toContain(reqB);
        expireStaleBuddyRequests();

        const { candidate } = findBestCandidate({
            userId: a.discord_id,
            myRequestId: reqA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'guild_1',
            excludeUserIds: new Set(),
        });
        expect(candidate).toBeNull();
    });
});
