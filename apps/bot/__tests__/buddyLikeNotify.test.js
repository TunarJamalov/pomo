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
    recordBuddySwipe,
    hasBuddyLiked,
} = require('../utils/database');
const {
    handleBuddyLike,
    buildPendingLikeDM,
    notifyPendingLike,
} = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_notify_${Date.now()}.db`);
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

function reqStatus(id) {
    return db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(id).status;
}

// Fake Discord client: controllable user fetch + DM delivery, records sends.
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

function dmText(entry) {
    if (typeof entry.msg === 'string') return entry.msg;
    if (entry.msg && typeof entry.msg.content === 'string') return entry.msg.content;
    return JSON.stringify(entry.msg);
}

function dmsTo(client, userId) {
    return client.sent
        .filter(s => s.to === userId)
        .map(s => ({ ...s, msg: dmText(s) }));
}

describe('Pending-like DM content (anonymity)', () => {
    test('contains CTA and context, leaks no identity', () => {
        const likerId = 'liker_secret_123';
        const likerName = 'SecretLikerName';
        const guildId = 'secret_guild_999';
        const msg = buildPendingLikeDM({ subject: 'Math', duration: 60, mode: 'silent' });

        expect(msg).toContain('/findbuddy');
        expect(msg).toContain('Math');
        expect(msg).not.toContain(likerId);
        expect(msg).not.toContain(likerName);
        expect(msg).not.toContain(guildId);
        expect(msg).not.toContain('<@');
    });
});

describe('notifyPendingLike unit behavior', () => {
    test('returns true on successful delivery', async () => {
        const b = getOrCreateUser('np_b');
        const client = makeClient();
        const ok = await notifyPendingLike(client, b.discord_id, { subject: 'Math', duration: 60, mode: 'silent' });
        expect(ok).toBe(true);
        expect(dmsTo(client, b.discord_id).length).toBe(1);
    });

    test('returns false when user cannot be fetched', async () => {
        const client = makeClient({ fetchable: new Set() });
        const ok = await notifyPendingLike(client, 'ghost_user', { subject: 'Math', duration: 60, mode: 'silent' });
        expect(ok).toBe(false);
    });

    test('returns false (no throw) when DM send fails', async () => {
        const b = getOrCreateUser('nf_b');
        const client = makeClient({ failSendFor: new Set([b.discord_id]) });
        let threw = false;
        let ok = null;
        try {
            ok = await notifyPendingLike(client, b.discord_id, { subject: 'Math', duration: 60, mode: 'silent' });
        } catch (_) {
            threw = true;
        }
        expect(threw).toBe(false);
        expect(ok).toBe(false);
    });
});

describe('handleBuddyLike notification flow', () => {
    test('pending (one-sided) Like notifies target exactly once, no match', async () => {
        const a = getOrCreateUser('pl_a');
        const b = getOrCreateUser('pl_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);
        const client = makeClient();
        const ix = makeButtonInteraction({ userId: a.discord_id, client });

        await handleBuddyLike(ix, reqB, reqA);

        const toB = dmsTo(client, b.discord_id);
        expect(toB.length).toBe(1);
        expect(toB[0].msg).toContain('/findbuddy');
        expect(toB[0].msg).not.toContain(a.discord_id);
        expect(toB[0].msg).not.toContain('Liker_');
        expect(toB[0].msg).not.toContain("It's a Match");

        // No match happened
        expect(reqStatus(reqA)).toBe('waiting');
        expect(reqStatus(reqB)).toBe('waiting');
        // Liker got the liked confirmation
        expect(ix.calls.followUps.some(f => String(f.content || '').includes('Liked'))).toBe(true);
        expect(hasBuddyLiked(a.discord_id, b.discord_id)).toBe(true);
    });

    test('mutual Like sends only match DM, no pending notification', async () => {
        const a = getOrCreateUser('mu_a');
        const b = getOrCreateUser('mu_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);

        // B liked A first (no notification assertion here)
        recordBuddySwipe(b.discord_id, a.discord_id, reqA, 'like');

        const client = makeClient();
        const ix = makeButtonInteraction({ userId: a.discord_id, client });
        await handleBuddyLike(ix, reqB, reqA);

        // Match finalized
        expect(reqStatus(reqA)).toBe('matched');
        expect(reqStatus(reqB)).toBe('matched');

        // B got exactly one DM and it is the match DM, not the pending one
        const toB = dmsTo(client, b.discord_id);
        expect(toB.length).toBe(1);
        expect(toB[0].msg).toContain("It's a Match");
        expect(toB[0].msg).not.toContain('Someone compatible liked you');
    });

    test('duplicate Like press does not re-notify', async () => {
        const a = getOrCreateUser('dup_a');
        const b = getOrCreateUser('dup_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);
        const client = makeClient();

        await handleBuddyLike(makeButtonInteraction({ userId: a.discord_id, client }), reqB, reqA);
        await handleBuddyLike(makeButtonInteraction({ userId: a.discord_id, client }), reqB, reqA);

        const pendingToB = dmsTo(client, b.discord_id).filter(s => s.msg.includes('Someone compatible liked you'));
        expect(pendingToB.length).toBe(1);
        const rows = db.prepare('SELECT * FROM buddy_swipes WHERE swiper_id = ?').all(a.discord_id);
        expect(rows.length).toBe(1);
    });

    test('DM failure does not break the Like flow', async () => {
        const a = getOrCreateUser('df_a');
        const b = getOrCreateUser('df_b');
        const reqA = makeReq(a.discord_id);
        const reqB = makeReq(b.discord_id);
        const client = makeClient({ failSendFor: new Set([b.discord_id]) });
        const ix = makeButtonInteraction({ userId: a.discord_id, client });

        let threw = false;
        try {
            await handleBuddyLike(ix, reqB, reqA);
        } catch (_) {
            threw = true;
        }

        expect(threw).toBe(false);
        // Like persisted, queue advanced, liker informed
        expect(hasBuddyLiked(a.discord_id, b.discord_id)).toBe(true);
        expect(ix.calls.updates.length).toBeGreaterThan(0);
        expect(ix.calls.followUps.some(f => String(f.content || '').includes('Liked'))).toBe(true);
        expect(dmsTo(client, b.discord_id).length).toBe(0);
    });
});
