const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const {
    db,
    initDatabase,
    getOrCreateUser,
    createChallenge,
    getActiveChallengesForGuild,
    joinChallenge,
    getChallengeLeaderboard,
    updateChallengeProgress,
    getActiveChallengesForUser,
} = require('../utils/database');

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_challenge_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

beforeAll(() => initDatabase());
afterAll(() => {
    try { db.close(); } catch (_) {}
    try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM challenge_members;');
    db.exec('DELETE FROM challenges;');
});

describe('Community Challenges', () => {
    test('creates a challenge and stores it', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        const result = createChallenge(user.discord_id, 'guild_1', '30 Day JS', 'time', 2100, end);
        expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    test('lists active challenges for guild', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        createChallenge(user.discord_id, 'guild_1', 'Week Challenge', 'sessions', 21, end);

        const challenges = getActiveChallengesForGuild('guild_1');
        expect(challenges.length).toBe(1);
        expect(challenges[0].title).toBe('Week Challenge');
    });

    test('returns empty array when no challenges', () => {
        const challenges = getActiveChallengesForGuild('guild_1');
        expect(challenges).toEqual([]);
    });

    test('user can join a challenge', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        const result = createChallenge(user.discord_id, 'guild_1', 'Test Challenge', 'time', 100, end);
        const challengeId = Number(result.lastInsertRowid);

        joinChallenge(challengeId, user.discord_id);

        const leaderboard = getChallengeLeaderboard(challengeId);
        expect(leaderboard.length).toBe(1);
        expect(leaderboard[0].discord_id).toBe(user.discord_id);
    });

    test('updating challenge progress increases progress', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        const result = createChallenge(user.discord_id, 'guild_1', 'Test', 'time', 100, end);
        joinChallenge(Number(result.lastInsertRowid), user.discord_id);

        updateChallengeProgress(Number(result.lastInsertRowid), user.discord_id, 30);
        updateChallengeProgress(Number(result.lastInsertRowid), user.discord_id, 20);

        const lb = getChallengeLeaderboard(Number(result.lastInsertRowid));
        expect(lb[0].progress).toBe(50);
    });

    test('challenge does not appear after end date', () => {
        const user = getOrCreateUser('user_1');
        const past = new Date(Date.now() - 1 * 86400000).toISOString();
        createChallenge(user.discord_id, 'guild_1', 'Expired', 'time', 100, past);

        const challenges = getActiveChallengesForGuild('guild_1');
        expect(challenges.length).toBe(0);
    });

    test('getActiveChallengesForUser returns user challenges', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        const result = createChallenge(user.discord_id, 'guild_1', 'Test', 'time', 100, end);
        joinChallenge(Number(result.lastInsertRowid), user.discord_id);

        const active = getActiveChallengesForUser(user.discord_id, 'guild_1');
        expect(active.length).toBe(1);
        expect(active[0].id).toBe(Number(result.lastInsertRowid));
    });

    test('joinChallenge is idempotent', () => {
        const user = getOrCreateUser('user_1');
        const end = new Date(Date.now() + 7 * 86400000).toISOString();
        const result = createChallenge(user.discord_id, 'guild_1', 'Test', 'time', 100, end);
        joinChallenge(Number(result.lastInsertRowid), user.discord_id);
        joinChallenge(Number(result.lastInsertRowid), user.discord_id); // duplicate

        const lb = getChallengeLeaderboard(Number(result.lastInsertRowid));
        expect(lb.length).toBe(1);
    });
});
