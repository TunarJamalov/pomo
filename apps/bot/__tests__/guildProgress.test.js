const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_guild_progress_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    recordGuildFocusProgress,
    getGuildProgress,
    getGuildXpToNextLevel,
    guildLevelForXp,
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
    db.exec('DELETE FROM guild_xp_events; DELETE FROM guild_progress; DELETE FROM guild_settings;');
});

describe('guild progression', () => {
    test('records focus progress and calculates the next level', () => {
        const result = recordGuildFocusProgress({
            guildId: 'guild_1',
            guildName: 'Study Club',
            minutes: 25,
            sourceType: 'solo',
            sourceId: 101,
        });

        expect(result.recorded).toBe(true);
        expect(result.xp).toBe(25);
        expect(result.level).toBe(1);

        const progress = getGuildProgress('guild_1');
        expect(progress.guild_name).toBe('Study Club');
        expect(progress.total_focus_minutes).toBe(25);
        expect(progress.total_sessions).toBe(1);
        expect(getGuildXpToNextLevel(progress)).toEqual({
            current: 25,
            required: 100,
            remaining: 75,
        });
    });

    test('does not award the same source twice', () => {
        const input = {
            guildId: 'guild_2',
            minutes: 100,
            sourceType: 'voice',
            sourceId: 202,
        };

        expect(recordGuildFocusProgress(input).recorded).toBe(true);
        const duplicate = recordGuildFocusProgress(input);

        expect(duplicate.recorded).toBe(false);
        expect(duplicate.duplicate).toBe(true);
        expect(getGuildProgress('guild_2').total_focus_minutes).toBe(100);
        expect(getGuildProgress('guild_2').total_sessions).toBe(1);
    });

    test('uses cumulative thresholds for server levels', () => {
        expect(guildLevelForXp(99)).toBe(1);
        expect(guildLevelForXp(100)).toBe(2);
        expect(guildLevelForXp(299)).toBe(2);
        expect(guildLevelForXp(300)).toBe(3);
    });
});
