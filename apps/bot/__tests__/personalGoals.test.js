const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_personal_goals_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    configurePersonalGoal,
    getOrCreateCurrentPersonalGoal,
    getPersonalGoalStats,
    recordPersonalGoalContribution,
    disablePersonalGoal,
    getPersonalGoalPeriod,
} = require('../utils/database');
const { addGoalProgress } = require('../utils/goalManager');

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
        DELETE FROM personal_goal_contributions;
        DELETE FROM personal_goals;
        DELETE FROM personal_goal_settings;
        DELETE FROM users;
    `);
});

describe('Pomo Pro personal goals', () => {
    test('calculates UTC weekly and monthly periods', () => {
        expect(getPersonalGoalPeriod('weekly', new Date('2026-06-10T12:00:00Z')))
            .toEqual({ start: '2026-06-08', end: '2026-06-14' });
        expect(getPersonalGoalPeriod('monthly', new Date('2026-06-10T12:00:00Z')))
            .toEqual({ start: '2026-06-01', end: '2026-06-30' });
    });

    test('creates a recurring goal and records each source only once', () => {
        const now = new Date('2026-06-10T12:00:00Z');
        const goal = configurePersonalGoal('goal_user', 'weekly', 300, now);
        const first = recordPersonalGoalContribution('goal_user', 120, 'solo', 'session_1', now);
        const duplicate = recordPersonalGoalContribution('goal_user', 120, 'solo', 'session_1', now);
        const completed = recordPersonalGoalContribution('goal_user', 180, 'voice', 'voice_1', now);

        expect(goal).toMatchObject({
            period_type: 'weekly',
            period_start: '2026-06-08',
            period_end: '2026-06-14',
            target_minutes: 300,
        });
        expect(first.inserted).toBe(true);
        expect(duplicate.inserted).toBe(false);
        expect(completed.justCompleted).toBe(true);
        expect(completed.goal.status).toBe('completed');
        expect(getPersonalGoalStats(goal.id)).toEqual({
            total_minutes: 300,
            sessions: 2,
        });
    });

    test('starts the next recurring period automatically', () => {
        const june = new Date('2026-06-10T12:00:00Z');
        const july = new Date('2026-07-02T12:00:00Z');
        const first = configurePersonalGoal('monthly_user', 'monthly', 1200, june);
        const next = getOrCreateCurrentPersonalGoal('monthly_user', july);

        expect(first.period_start).toBe('2026-06-01');
        expect(next.period_start).toBe('2026-07-01');
        expect(next.period_end).toBe('2026-07-31');
        expect(next.target_minutes).toBe(1200);
        expect(next.id).not.toBe(first.id);
    });

    test('recalculates completion when the target changes in the same period', () => {
        const now = new Date('2026-06-10T12:00:00Z');
        configurePersonalGoal('edit_user', 'weekly', 120, now);
        recordPersonalGoalContribution('edit_user', 120, 'team', 'team_1', now);

        const increased = configurePersonalGoal('edit_user', 'weekly', 300, now);
        expect(increased.status).toBe('active');

        const reduced = configurePersonalGoal('edit_user', 'weekly', 60, now);
        expect(reduced.status).toBe('completed');
    });

    test('disables the current goal and prevents contributions', () => {
        const now = new Date('2026-06-10T12:00:00Z');
        configurePersonalGoal('disabled_user', 'weekly', 300, now);
        disablePersonalGoal('disabled_user');

        expect(getOrCreateCurrentPersonalGoal('disabled_user', now)).toBeNull();
        expect(recordPersonalGoalContribution(
            'disabled_user',
            60,
            'solo',
            'session_1',
            now,
        )).toBeNull();
    });

    test('validates period and target limits', () => {
        expect(() => configurePersonalGoal('bad_user', 'daily', 300)).toThrow(RangeError);
        expect(() => configurePersonalGoal('bad_user', 'weekly', 30)).toThrow(RangeError);
        expect(() => configurePersonalGoal('bad_user', 'monthly', 30000)).toThrow(RangeError);
    });

    test('the shared completion flow records only active Pro personal goals', async () => {
        const now = new Date();
        configurePersonalGoal('pro_user', 'weekly', 120, now);
        configurePersonalGoal('free_user', 'weekly', 120, now);
        db.prepare('UPDATE users SET premium = 1 WHERE discord_id = ?').run('pro_user');

        await addGoalProgress(null, {
            guildId: null,
            userId: 'pro_user',
            minutes: 60,
            sourceType: 'solo',
            sourceId: 'pro_session',
        });
        await addGoalProgress(null, {
            guildId: null,
            userId: 'free_user',
            minutes: 60,
            sourceType: 'solo',
            sourceId: 'free_session',
        });

        const proGoal = getOrCreateCurrentPersonalGoal('pro_user', now);
        const freeGoal = getOrCreateCurrentPersonalGoal('free_user', now);
        expect(getPersonalGoalStats(proGoal.id).total_minutes).toBe(60);
        expect(getPersonalGoalStats(freeGoal.id).total_minutes).toBe(0);
    });
});
