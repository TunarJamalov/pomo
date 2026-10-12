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
    isBuddyUnmatched,
    unmatchBuddyPair,
    hasBuddyMatchHistory,
    createBuddyReport,
    normalizeBuddyReportReason,
    countBuddyReportsToday,
    countRecentBuddyRequests,
    isBuddyBlocked,
    blockBuddyUser,
    recordBuddySwipe,
} = require('../utils/database');
const {
    findBestCandidate,
    candidateCardPayload,
    createRateLimiter,
    handleBuddyLike,
    handleBuddyUnmatch,
    handleBuddyReportButton,
    handleBuddyReportSubmit,
    doUnmatch,
} = require('../commands/findbuddy');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_buddy_trust_${Date.now()}.db`);
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
});

function makeReq(userId, guildId = 'guild_1', subject = 'Math', duration = 60, mode = 'silent') {
    const r = createBuddyRequest(userId, guildId, subject, duration, mode);
    return Number(r.lastInsertRowid);
}

function reqStatus(id) {
    return db.prepare('SELECT status FROM buddy_requests WHERE id = ?').get(id).status;
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

function makeIx({ userId, guildId = 'guild_1', client, username = null }) {
    const calls = { updates: [], followUps: [], replies: [], modals: [] };
    return {
        calls,
        user: { id: userId, username: username || ('Ix_' + userId) },
        guildId,
        client: client || makeClient(),
        update: async (payload) => { calls.updates.push(payload); },
        followUp: async (payload) => { calls.followUps.push(payload); },
        reply: async (payload) => { calls.replies.push(payload); },
        showModal: async (modal) => { calls.modals.push(modal); },
    };
}

function makeModalIx({ userId, customId, reason, details, client }) {
    const calls = { replies: [] };
    return {
        calls,
        customId,
        user: { id: userId, username: 'Ix_' + userId },
        fields: {
            getTextInputValue: (fieldId) => {
                if (fieldId === 'buddy_report_reason') return reason;
                if (fieldId === 'buddy_report_details') return details;
                return null;
            },
        },
        client: client || makeClient(),
        reply: async (payload) => { calls.replies.push(payload); },
    };
}

describe('Unmatch', () => {
    test('ends a mutual match, preserves history rows', () => {
        const { a, b, reqA, reqB } = makeMatchedPair('un_a', 'un_b');

        const res = unmatchBuddyPair(a, reqA);
        expect(res.ok).toBe(true);
        expect(res.partnerId).toBe(b);

        expect(reqStatus(reqA)).toBe('unmatched');
        expect(reqStatus(reqB)).toBe('unmatched');

        // History rows intact (not deleted)
        const rows = db.prepare('SELECT * FROM buddy_requests WHERE id IN (?, ?)').all(reqA, reqB);
        expect(rows.length).toBe(2);
        expect(rows.find(r => r.id === reqA).matched_user_id).toBe(b);
    });

    test('unmatch is bidirectional and second unmatch reports none', () => {
        const { a, b } = makeMatchedPair('un2_a', 'un2_b');

        expect(unmatchBuddyPair(a).ok).toBe(true);
        expect(isBuddyUnmatched(a, b)).toBe(true);
        expect(isBuddyUnmatched(b, a)).toBe(true);

        const again = unmatchBuddyPair(a);
        expect(again.ok).toBe(false);
        expect(again.reason).toBe('no_active_match');
    });

    test('unmatched users excluded from future queue', () => {
        const { a, b } = makeMatchedPair('un3_a', 'un3_b');
        unmatchBuddyPair(a);

        // Both re-queue with compatible prefs
        const newA = makeReq(a, 'guild_1', 'Math', 60, 'silent');
        makeReq(b, 'guild_1', 'Math', 60, 'silent');

        const { candidate } = findBestCandidate({
            userId: a,
            myRequestId: newA,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            guildId: 'guild_1',
            excludeUserIds: new Set(),
        });
        expect(candidate).toBeNull();
    });

    test('handleBuddyUnmatch happy path notifies partner anonymously', async () => {
        const { a, b, reqA } = makeMatchedPair('unh_a', 'unh_b');
        const client = makeClient();
        const ix = makeIx({ userId: a, client, username: 'SecretEnder' });

        await handleBuddyUnmatch(ix, reqA);

        expect(ix.calls.updates.length).toBeGreaterThan(0);
        expect(reqStatus(reqA)).toBe('unmatched');

        const toB = client.sent.filter(s => s.to === b);
        expect(toB.length).toBe(1);
        expect(toB[0].msg).not.toContain('SecretEnder');
        expect(toB[0].msg).not.toContain(a);
    });

    test('handleBuddyUnmatch without match errors and sends no DM', async () => {
        const a = getOrCreateUser('unn_a');
        const client = makeClient();
        const ix = makeIx({ userId: a.discord_id, client });

        await handleBuddyUnmatch(ix, 999999);

        expect(ix.calls.replies.length).toBe(1);
        expect(client.sent.length).toBe(0);
    });

    test('doUnmatch tolerates partner DM failure', async () => {
        const { a, b } = makeMatchedPair('und_a', 'und_b');
        const client = makeClient({ failSendFor: new Set([b]) });

        const res = await doUnmatch(client, a);
        expect(res.ok).toBe(true);
        expect(client.sent.length).toBe(0);
    });
});

describe('Report', () => {
    test('normalizeBuddyReportReason maps aliases, rejects junk', () => {
        expect(normalizeBuddyReportReason('Spam ')).toBe('spam');
        expect(normalizeBuddyReportReason('SUSPICIOUS')).toBe('fake');
        expect(normalizeBuddyReportReason('Fake Profile')).toBe('fake');
        expect(normalizeBuddyReportReason('abuse')).toBe('harassment');
        expect(normalizeBuddyReportReason('nonsense')).toBeNull();
        expect(normalizeBuddyReportReason(null)).toBeNull();
        expect(normalizeBuddyReportReason(42)).toBeNull();
    });

    test('valid report stored open with trimmed fields', () => {
        const { a, b, reqA } = makeMatchedPair('rp_a', 'rp_b');
        const res = createBuddyReport({
            reporterId: a, reportedId: b, requestId: reqA,
            reason: 'Spam ', description: '  hello  ',
        });
        expect(res.ok).toBe(true);

        const row = db.prepare('SELECT * FROM buddy_reports WHERE id = ?').get(res.id);
        expect(row.reason).toBe('spam');
        expect(row.description).toBe('hello');
        expect(row.status).toBe('open');
        expect(row.request_id).toBe(reqA);
    });

    test('self report rejected', () => {
        const a = getOrCreateUser('rp_self');
        const res = createBuddyReport({ reporterId: a.discord_id, reportedId: a.discord_id, reason: 'spam' });
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('self_report');
    });

    test('report without match history rejected', () => {
        const a = getOrCreateUser('rp_nh_a');
        const b = getOrCreateUser('rp_nh_b');
        const res = createBuddyReport({ reporterId: a.discord_id, reportedId: b.discord_id, reason: 'spam' });
        expect(res.ok).toBe(false);
        expect(res.reason).toBe('no_match_history');
    });

    test('duplicate open report rejected', () => {
        const { a, b } = makeMatchedPair('rp_d_a', 'rp_d_b');
        expect(createBuddyReport({ reporterId: a, reportedId: b, reason: 'spam' }).ok).toBe(true);
        const dup = createBuddyReport({ reporterId: a, reportedId: b, reason: 'harassment' });
        expect(dup.ok).toBe(false);
        expect(dup.reason).toBe('duplicate_open');
    });

    test('daily cap enforced at 5 reports', () => {
        const r = getOrCreateUser('rp_cap_r');
        for (let i = 1; i <= 6; i++) {
            const u = getOrCreateUser('rp_cap_u' + i);
            const reqR = makeReq(r.discord_id, 'guild_1');
            const reqU = makeReq(u.discord_id, 'guild_1');
            matchBuddyPair(reqR, u.discord_id, reqU, r.discord_id, 80);
        }
        for (let i = 1; i <= 5; i++) {
            const res = createBuddyReport({ reporterId: r.discord_id, reportedId: 'rp_cap_u' + i, reason: 'spam' });
            expect(res.ok).toBe(true);
        }
        const sixth = createBuddyReport({ reporterId: r.discord_id, reportedId: 'rp_cap_u6', reason: 'spam' });
        expect(sixth.ok).toBe(false);
        expect(sixth.reason).toBe('rate_limited');
        expect(countBuddyReportsToday(r.discord_id)).toBe(5);
    });

    test('report button without match history errors, no modal', async () => {
        const a = getOrCreateUser('rp_b_a');
        const b = getOrCreateUser('rp_b_b');
        const ix = makeIx({ userId: a.discord_id, client: makeClient() });

        await handleBuddyReportButton(ix, b.discord_id, 12345);
        expect(ix.calls.modals.length).toBe(0);
        expect(ix.calls.replies.length).toBe(1);
    });

    test('report button with history shows modal', async () => {
        const { a, b, reqA } = makeMatchedPair('rp_m_a', 'rp_m_b');
        const ix = makeIx({ userId: a, client: makeClient() });

        await handleBuddyReportButton(ix, b, reqA);
        expect(ix.calls.modals.length).toBe(1);
        expect(ix.calls.modals[0].data.custom_id).toContain(b);
    });

    test('modal submit happy path files report', async () => {
        const { a, b, reqA } = makeMatchedPair('rp_s_a', 'rp_s_b');
        const ix = makeModalIx({
            userId: a,
            customId: `buddy_report_modal_${b}_${reqA}`,
            reason: 'harassment',
            details: 'was rude in DMs',
            client: makeClient(),
        });

        await handleBuddyReportSubmit(ix);
        expect(ix.calls.replies.length).toBe(1);
        const row = db.prepare('SELECT * FROM buddy_reports WHERE reporter_user_id = ?').get(a);
        expect(row).toBeTruthy();
        expect(row.reason).toBe('harassment');
        expect(row.description).toBe('was rude in DMs');
    });

    test('modal submit invalid reason files nothing', async () => {
        const { a, b, reqA } = makeMatchedPair('rp_i_a', 'rp_i_b');
        const ix = makeModalIx({
            userId: a,
            customId: `buddy_report_modal_${b}_${reqA}`,
            reason: 'nonsense reason',
            details: '',
            client: makeClient(),
        });

        await handleBuddyReportSubmit(ix);
        expect(ix.calls.replies.length).toBe(1);
        const row = db.prepare('SELECT * FROM buddy_reports WHERE reporter_user_id = ?').get(a);
        expect(row).toBeFalsy();
    });
});

describe('Block trust review', () => {
    test('block prevents cross-server matching in both directions', () => {
        const a = getOrCreateUser('blx_a');
        const b = getOrCreateUser('blx_b');
        const reqA = makeReq(a.discord_id, 'guild_1');
        const reqB = makeReq(b.discord_id, 'guild_2');

        expect(isBuddyBlocked(a.discord_id, b.discord_id)).toBe(false);
        db.prepare('INSERT INTO buddy_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(a.discord_id, b.discord_id);
        expect(isBuddyBlocked(a.discord_id, b.discord_id)).toBe(true);
        expect(isBuddyBlocked(b.discord_id, a.discord_id)).toBe(true);

        const prefs = { subject: 'Math', duration: 60, mode: 'silent' };
        const fromA = findBestCandidate({ userId: a.discord_id, myRequestId: reqA, prefs, guildId: 'guild_1', excludeUserIds: new Set() });
        const fromB = findBestCandidate({ userId: b.discord_id, myRequestId: reqB, prefs, guildId: 'guild_2', excludeUserIds: new Set() });
        expect(fromA.candidate).toBeNull();
        expect(fromB.candidate).toBeNull();
    });

    test('block prevents Like interaction at handler level', async () => {
        const a = getOrCreateUser('blh_a');
        const b = getOrCreateUser('blh_b');
        const reqA = makeReq(a.discord_id, 'guild_1');
        const reqB = makeReq(b.discord_id, 'guild_1');
        db.prepare('INSERT INTO buddy_blocks (blocker_id, blocked_id) VALUES (?, ?)').run(a.discord_id, b.discord_id);

        const client = makeClient();
        const ix = makeIx({ userId: a.discord_id, client });
        await handleBuddyLike(ix, reqB, reqA);

        const swipes = db.prepare('SELECT * FROM buddy_swipes WHERE swiper_id = ?').all(a.discord_id);
        expect(swipes.length).toBe(0);
        expect(reqStatus(reqB)).toBe('waiting');
        expect(ix.calls.followUps.some(f => String(f.content || '').includes('no longer available'))).toBe(true);
        expect(client.sent.length).toBe(0);
    });

    test('block sends no DM to the blocked user', async () => {
        const a = getOrCreateUser('bln_a');
        const b = getOrCreateUser('bln_b');
        const reqA = makeReq(a.discord_id, 'guild_1');
        const reqB = makeReq(b.discord_id, 'guild_1');
        const { handleBuddyBlock } = require('../commands/findbuddy');

        const client = makeClient();
        const ix = makeIx({ userId: a.discord_id, client });
        await handleBuddyBlock(ix, reqB, reqA);

        expect(isBuddyBlocked(a.discord_id, b.discord_id)).toBe(true);
        expect(client.sent.length).toBe(0);
    });
});

describe('Rate limits', () => {
    test('limiter allows N then blocks, slides with time, resets', () => {
        const { createRateLimiter } = require('../commands/findbuddy');
        const lim = createRateLimiter(3, 1000);
        expect(lim.check('u')).toBe(true);
        expect(lim.check('u')).toBe(true);
        expect(lim.check('u')).toBe(true);
        expect(lim.check('u')).toBe(false);
        expect(lim.check('other')).toBe(true);
        expect(lim.check('u', Date.now() + 1001)).toBe(true);
        lim.reset();
        expect(lim.check('u')).toBe(true);
    });

    test('request creation counting works for hourly cap', () => {
        const u = getOrCreateUser('rl_u');
        for (let i = 0; i < 10; i++) {
            const id = makeReq(u.discord_id, 'guild_1');
            db.prepare("UPDATE buddy_requests SET status = 'cancelled' WHERE id = ?").run(id);
        }
        const { countRecentBuddyRequests } = require('../utils/database');
        expect(countRecentBuddyRequests(u.discord_id, 60)).toBe(10);
    });
});

describe('Candidate card privacy', () => {
    test('card shows only match-safe fields, no identity', () => {
        const candidate = {
            id: 4242,
            user_id: 'secret_user_987',
            guild_id: 'secret_guild_555',
            subject: 'Math',
            duration: 60,
            mode: 'silent',
        };
        const payload = candidateCardPayload({
            candidate,
            prefs: { subject: 'Math', duration: 60, mode: 'silent' },
            score: 70,
            myRequestId: 7,
            guildId: 'guild_1',
            likedYou: false,
        });

        const text = JSON.stringify(payload);
        expect(text).toContain('Math');
        expect(text).toContain('60');
        expect(text).toContain('Another server');
        expect(text).not.toContain('secret_user_987');
        expect(text).not.toContain('secret_guild_555');
        expect(text).not.toContain('SecretName');
        expect(text).not.toContain('<@');
    });
});
