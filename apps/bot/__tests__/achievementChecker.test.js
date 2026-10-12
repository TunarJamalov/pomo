/**
 * Tests for utils/achievementChecker.js
 * Uses POMODORO_DB_PATH env var to redirect DB to a temp file.
 *
 * NOTE: Jest runs each test file in its own worker, so this module's
 * process.env change is isolated and won't affect other test suites.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Must be set BEFORE any require() that transitively loads database.js
const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_ach_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const { db, initDatabase, getOrCreateUser, updateUser } = require('../utils/database');
const {
    hasAchievement,
    unlockAchievement,
    getUserAchievements,
    checkStudyAchievements,
    checkTeamAchievements,
    checkGardenAchievements,
} = require('../utils/achievementChecker');

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
        DELETE FROM user_titles;
        DELETE FROM user_achievements;
        DELETE FROM inventory;
        DELETE FROM settings;
        DELETE FROM study_sessions;
        DELETE FROM garden_plots;
        DELETE FROM harvested_items;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM users;
    `);
});

// ── hasAchievement / unlockAchievement ────────────────────────

describe('hasAchievement', () => {
    test('returns false when user has no achievements', () => {
        getOrCreateUser('ach_user_1');
        expect(hasAchievement('ach_user_1', 'early_bird')).toBe(false);
    });

    test('returns true after unlocking', () => {
        getOrCreateUser('ach_user_2');
        unlockAchievement('ach_user_2', 'early_bird');
        expect(hasAchievement('ach_user_2', 'early_bird')).toBe(true);
    });
});

describe('unlockAchievement', () => {
    test('returns the achievement object on first unlock', () => {
        getOrCreateUser('ach_user_3');
        const result = unlockAchievement('ach_user_3', 'marathon_runner');
        expect(result).not.toBeNull();
        expect(result.key).toBe('marathon_runner');
        expect(result.name).toBe('Marathon Runner');
    });

    test('returns null if already unlocked (no duplicates)', () => {
        getOrCreateUser('ach_user_4');
        unlockAchievement('ach_user_4', 'early_bird');
        const second = unlockAchievement('ach_user_4', 'early_bird');
        expect(second).toBeNull();
    });

    test('returns null for unknown achievement key', () => {
        getOrCreateUser('ach_user_5');
        const result = unlockAchievement('ach_user_5', 'nonexistent_key');
        expect(result).toBeNull();
    });
});

describe('getUserAchievements', () => {
    test('returns empty array when no achievements', () => {
        getOrCreateUser('ach_user_6');
        expect(getUserAchievements('ach_user_6')).toEqual([]);
    });

    test('returns all unlocked achievements', () => {
        getOrCreateUser('ach_user_7');
        unlockAchievement('ach_user_7', 'early_bird');
        unlockAchievement('ach_user_7', 'night_owl');
        const achievements = getUserAchievements('ach_user_7');
        expect(achievements.length).toBe(2);
    });
});

// ── checkStudyAchievements — time-based ───────────────────────

describe('checkStudyAchievements — time-based', () => {
    test('early_bird unlocked when startHour < 6', () => {
        getOrCreateUser('ach_study_1');
        const unlocked = checkStudyAchievements('ach_study_1', 25, 5);
        expect(unlocked.map(a => a.key)).toContain('early_bird');
    });

    test('early_bird NOT unlocked when startHour >= 6', () => {
        getOrCreateUser('ach_study_2');
        const unlocked = checkStudyAchievements('ach_study_2', 25, 10);
        expect(unlocked.map(a => a.key)).not.toContain('early_bird');
    });

    test('night_owl unlocked when startHour = 0', () => {
        getOrCreateUser('ach_study_3');
        const unlocked = checkStudyAchievements('ach_study_3', 25, 0);
        expect(unlocked.map(a => a.key)).toContain('night_owl');
    });

    test('night_owl NOT unlocked when startHour = 1 (boundary)', () => {
        getOrCreateUser('ach_study_4');
        const unlocked = checkStudyAchievements('ach_study_4', 25, 1);
        expect(unlocked.map(a => a.key)).not.toContain('night_owl');
    });

    test('marathon_runner unlocked for >= 100 min session', () => {
        getOrCreateUser('ach_study_5');
        const unlocked = checkStudyAchievements('ach_study_5', 100, 10);
        expect(unlocked.map(a => a.key)).toContain('marathon_runner');
    });

    test('marathon_runner NOT unlocked for < 100 min session', () => {
        getOrCreateUser('ach_study_6');
        const unlocked = checkStudyAchievements('ach_study_6', 99, 10);
        expect(unlocked.map(a => a.key)).not.toContain('marathon_runner');
    });
});

// ── checkStudyAchievements — streak-based ─────────────────────

describe('checkStudyAchievements — streak-based', () => {
    test('dedicated unlocked at streak >= 7', () => {
        getOrCreateUser('ach_streak_1');
        updateUser('ach_streak_1', { streak: 7 });
        const unlocked = checkStudyAchievements('ach_streak_1', 25, 10);
        expect(unlocked.map(a => a.key)).toContain('dedicated');
    });

    test('dedicated NOT unlocked at streak < 7', () => {
        getOrCreateUser('ach_streak_2');
        updateUser('ach_streak_2', { streak: 6 });
        const unlocked = checkStudyAchievements('ach_streak_2', 25, 10);
        expect(unlocked.map(a => a.key)).not.toContain('dedicated');
    });

    test('committed also unlocked at streak >= 30', () => {
        getOrCreateUser('ach_streak_3');
        updateUser('ach_streak_3', { streak: 30 });
        const unlocked = checkStudyAchievements('ach_streak_3', 25, 10);
        const keys = unlocked.map(a => a.key);
        expect(keys).toContain('dedicated');
        expect(keys).toContain('committed');
    });
});

// ── checkStudyAchievements — volume-based ─────────────────────

describe('checkStudyAchievements — volume-based', () => {
    test('beginner unlocked at >= 600 total minutes (10h)', () => {
        getOrCreateUser('ach_vol_1');
        updateUser('ach_vol_1', { total_focus_minutes: 600 });
        const unlocked = checkStudyAchievements('ach_vol_1', 25, 10);
        expect(unlocked.map(a => a.key)).toContain('beginner');
    });

    test('beginner NOT unlocked at < 600 total minutes', () => {
        getOrCreateUser('ach_vol_2');
        updateUser('ach_vol_2', { total_focus_minutes: 599 });
        const unlocked = checkStudyAchievements('ach_vol_2', 25, 10);
        expect(unlocked.map(a => a.key)).not.toContain('beginner');
    });
});

// ── checkGardenAchievements ────────────────────────────────────

describe('checkGardenAchievements', () => {
    function insertHarvests(userId, count) {
        for (let i = 0; i < count; i++) {
            db.prepare('INSERT INTO harvested_items (user_id, plant_type) VALUES (?, ?)').run(userId, 'carrot');
        }
    }

    test('green_thumb unlocked after 1st harvest', () => {
        getOrCreateUser('ach_garden_1');
        insertHarvests('ach_garden_1', 1);
        const unlocked = checkGardenAchievements('ach_garden_1');
        expect(unlocked.map(a => a.key)).toContain('green_thumb');
    });

    test('gardener unlocked after 50 harvests', () => {
        getOrCreateUser('ach_garden_2');
        insertHarvests('ach_garden_2', 50);
        const unlocked = checkGardenAchievements('ach_garden_2');
        const keys = unlocked.map(a => a.key);
        expect(keys).toContain('green_thumb');
        expect(keys).toContain('gardener');
    });

    test('master_gardener unlocked after 100 harvests', () => {
        getOrCreateUser('ach_garden_3');
        insertHarvests('ach_garden_3', 100);
        const unlocked = checkGardenAchievements('ach_garden_3');
        expect(unlocked.map(a => a.key)).toContain('master_gardener');
    });

    test('no achievements when 0 harvests', () => {
        getOrCreateUser('ach_garden_4');
        expect(checkGardenAchievements('ach_garden_4')).toEqual([]);
    });
});

// ── checkTeamAchievements ──────────────────────────────────────

describe('checkTeamAchievements', () => {
    function insertTeamMemberships(userId, count) {
        for (let i = 0; i < count; i++) {
            const res = db.prepare(
                `INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, status)
                 VALUES ('g', 'c', 'host_x', 25, 'completed')`
            ).run();
            db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(res.lastInsertRowid, userId);
        }
    }

    test('team_player unlocked after joining 10 sessions', () => {
        getOrCreateUser('ach_team_1');
        insertTeamMemberships('ach_team_1', 10);
        const unlocked = checkTeamAchievements('ach_team_1');
        expect(unlocked.map(a => a.key)).toContain('team_player');
    });

    test('team_player NOT unlocked when joined < 10 sessions', () => {
        getOrCreateUser('ach_team_2');
        insertTeamMemberships('ach_team_2', 5);
        const unlocked = checkTeamAchievements('ach_team_2');
        expect(unlocked.map(a => a.key)).not.toContain('team_player');
    });

    test('leader unlocked after hosting 50 completed sessions', () => {
        getOrCreateUser('ach_team_3');
        for (let i = 0; i < 50; i++) {
            db.prepare(
                `INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, status)
                 VALUES ('g', 'c', 'ach_team_3', 25, 'completed')`
            ).run();
        }
        const unlocked = checkTeamAchievements('ach_team_3');
        expect(unlocked.map(a => a.key)).toContain('leader');
    });
});
