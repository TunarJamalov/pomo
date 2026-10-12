const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_clan_test_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    createClan,
    joinClan,
    getUserClan,
    createClanInvite,
    getPendingClanInvite,
    acceptClanInvite,
    transferClanOwnership,
    dissolveClan,
} = require('../utils/database');

beforeAll(() => {
    initDatabase();
});

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM clan_invites;
        DELETE FROM clan_members;
        DELETE FROM clans;
    `);
});

describe('clan management helpers', () => {
    test('creates one pending invite per clan/member pair and accepts it', () => {
        const clanId = createClan('owner_1', 'Invite Clan');

        const first = createClanInvite(clanId, 'owner_1', 'member_1');
        const duplicate = createClanInvite(clanId, 'owner_1', 'member_1');

        expect(first.success).toBe(true);
        expect(duplicate.success).toBe(false);

        const pending = getPendingClanInvite(clanId, 'member_1');
        expect(pending).not.toBeUndefined();

        acceptClanInvite(pending.id);
        expect(getPendingClanInvite(clanId, 'member_1')).toBeUndefined();
    });

    test('transfers ownership to an existing member', () => {
        const clanId = createClan('owner_2', 'Transfer Clan');
        joinClan(clanId, 'member_2');

        const ok = transferClanOwnership(clanId, 'owner_2', 'member_2');

        expect(ok).toBe(true);
        expect(getUserClan('owner_2').role).toBe('member');
        expect(getUserClan('member_2').role).toBe('owner');
        expect(getUserClan('member_2').owner_id).toBe('member_2');
    });

    test('dissolves clan and removes members plus invites', () => {
        const clanId = createClan('owner_3', 'Dissolve Clan');
        joinClan(clanId, 'member_3');
        createClanInvite(clanId, 'owner_3', 'member_4');

        const ok = dissolveClan(clanId);

        expect(ok).toBe(true);
        expect(getUserClan('owner_3')).toBeUndefined();
        expect(getUserClan('member_3')).toBeUndefined();
        expect(db.prepare('SELECT COUNT(*) as count FROM clan_invites WHERE clan_id = ?').get(clanId).count).toBe(0);
    });
});
