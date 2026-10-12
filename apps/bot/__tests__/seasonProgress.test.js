const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_season_progress_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getActiveSeason,
    startNewSeason,
    getSeasonLeaderboard,
    getSeasonRewards,
    getOrCreateUser,
    incrementUser,
    getGuildProgress,
    recordGuildFocusProgress,
    createClan,
    addClanXP,
} = require('../utils/database');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
        if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
        if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM clan_members;
        DELETE FROM clans;
        DELETE FROM guild_xp_events;
        DELETE FROM guild_progress;
        DELETE FROM seasons;
        DELETE FROM users;
    `);
});

describe('global seasons', () => {
    test('starts a season and exposes user, server, and clan rankings', () => {
        const started = startNewSeason('The Focus Protocol');
        expect(started.success).toBe(true);
        expect(getActiveSeason().name).toBe('The Focus Protocol');

        getOrCreateUser('season_user');
        incrementUser('season_user', 'xp', 150);
        recordGuildFocusProgress({
            guildId: 'season_guild',
            guildName: 'Season Academy',
            minutes: 125,
            sourceType: 'solo',
            sourceId: 'season_session',
        });
        const clanId = createClan('season_user', 'Season Scholars');
        addClanXP(clanId, 100, 50);

        expect(getSeasonLeaderboard('users')[0].season_xp).toBe(150);
        expect(getSeasonLeaderboard('guilds')[0].season_xp).toBe(125);
        expect(getSeasonLeaderboard('clans')[0].season_xp).toBe(150);
    });

    test('resets seasonal counters and keeps duplicate season names safe', () => {
        expect(startNewSeason('Season One').success).toBe(true);
        getOrCreateUser('reset_user');
        incrementUser('reset_user', 'xp', 200);
        recordGuildFocusProgress({
            guildId: 'reset_guild',
            minutes: 200,
            sourceType: 'solo',
            sourceId: 'reset_session',
        });

        expect(startNewSeason('Season Two').success).toBe(true);
        expect(getOrCreateUser('reset_user').season_xp).toBe(0);
        expect(getGuildProgress('reset_guild').season_xp).toBe(0);

        const duplicate = startNewSeason('Season Two');
        expect(duplicate).toEqual({ success: false, reason: 'already_exists' });
        expect(getActiveSeason().name).toBe('Season Two');
    });

    test('returns configured seasonal reward thresholds', () => {
        expect(getSeasonRewards()).toEqual(expect.arrayContaining([
            expect.objectContaining({ threshold: 100 }),
            expect.objectContaining({ threshold: 2500 }),
        ]));
    });
});
