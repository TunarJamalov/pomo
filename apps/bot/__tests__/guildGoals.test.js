const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_guild_goals_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    configureGuildGoal,
    getOrCreateCurrentGuildGoal,
    getGuildGoalStats,
    recordGuildGoalContribution,
    claimGuildGoalReward,
    getOrCreateUser,
    getWeekStart,
} = require('../utils/database');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM guild_goal_claims;
        DELETE FROM guild_goal_contributions;
        DELETE FROM guild_goals;
        DELETE FROM guild_settings;
        DELETE FROM users;
    `);
});

describe('weekly guild goals', () => {
    test('calculates Monday as the UTC week start', () => {
        expect(getWeekStart(new Date('2026-06-07T12:00:00Z'))).toBe('2026-06-01');
        expect(getWeekStart(new Date('2026-06-08T00:00:00Z'))).toBe('2026-06-08');
    });

    test('calculates week start in a configured timezone', () => {
        expect(getWeekStart(new Date('2026-06-07T19:59:00Z'), 'Asia/Baku')).toBe('2026-06-01');
        expect(getWeekStart(new Date('2026-06-07T20:00:00Z'), 'Asia/Baku')).toBe('2026-06-08');
    });

    test('creates a recurring goal with protected rewards', () => {
        const goal = configureGuildGoal('goal_guild', 2500, 'goal_channel');

        expect(goal.target_minutes).toBe(2500);
        expect(goal.reward_water).toBe(5);
        expect(goal.reward_xp).toBe(25);
        expect(goal.min_contribution).toBe(25);
        expect(getOrCreateCurrentGuildGoal('goal_guild').id).toBe(goal.id);
    });

    test('records each source once and completes at the target', () => {
        configureGuildGoal('goal_guild', 500, 'goal_channel');

        const first = recordGuildGoalContribution('goal_guild', 'goal_user', 250, 'solo', 'session_1');
        const duplicate = recordGuildGoalContribution('goal_guild', 'goal_user', 250, 'solo', 'session_1');
        const completed = recordGuildGoalContribution('goal_guild', 'goal_user_2', 250, 'voice', 'voice_1');
        const stats = getGuildGoalStats(first.goal.id);

        expect(first.inserted).toBe(true);
        expect(duplicate.inserted).toBe(false);
        expect(completed.justCompleted).toBe(true);
        expect(completed.goal.status).toBe('completed');
        expect(stats.total_minutes).toBe(500);
        expect(stats.contributors).toBe(2);
    });

    test('requires contribution and allows only one reward claim', async () => {
        configureGuildGoal('goal_guild', 500, 'goal_channel');
        recordGuildGoalContribution('goal_guild', 'eligible_user', 475, 'solo', 'session_1');
        recordGuildGoalContribution('goal_guild', 'small_user', 10, 'solo', 'session_2');
        recordGuildGoalContribution('goal_guild', 'eligible_user', 15, 'voice', 'voice_1');

        const tooSmall = await claimGuildGoalReward('goal_guild', 'small_user');
        const claimed = await claimGuildGoalReward('goal_guild', 'eligible_user');
        const duplicate = await claimGuildGoalReward('goal_guild', 'eligible_user');
        const user = getOrCreateUser('eligible_user');

        expect(tooSmall.reason).toBe('contribution');
        expect(claimed.success).toBe(true);
        expect(duplicate.reason).toBe('claimed');
        expect(user.water).toBe(3);
        expect(user.xp).toBe(15);
    });
});
