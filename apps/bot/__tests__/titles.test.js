const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_titles_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
    getUserTitles,
    getActiveTitle,
    setActiveTitle,
    unlockTitle,
    incrementUser,
} = require('../utils/database');
const { unlockAchievement } = require('../utils/achievementChecker');

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
    db.exec('DELETE FROM user_titles; DELETE FROM user_achievements; DELETE FROM users;');
});

describe('profile titles', () => {
    test('achievement unlock automatically grants the matching title', () => {
        getOrCreateUser('title_user');
        expect(unlockAchievement('title_user', 'early_bird')).not.toBeNull();
        expect(getUserTitles('title_user').map(title => title.title_key)).toContain('early_bird');
    });

    test('season XP automatically grants seasonal titles', () => {
        getOrCreateUser('season_title_user');
        incrementUser('season_title_user', 'xp', 500);
        expect(getUserTitles('season_title_user').map(title => title.title_key)).toContain('season_scholar');
    });

    test('only unlocked titles can be equipped and active title can be cleared', () => {
        getOrCreateUser('equip_user');
        expect(setActiveTitle('equip_user', 'night_owl')).toEqual({ success: false, reason: 'locked' });

        unlockTitle('equip_user', 'early_bird');
        expect(setActiveTitle('equip_user', 'early_bird').success).toBe(true);
        expect(getActiveTitle('equip_user').name).toBe('Early Bird');

        expect(setActiveTitle('equip_user', null)).toEqual({ success: true, title: null });
        expect(getActiveTitle('equip_user')).toBeNull();
    });
});
