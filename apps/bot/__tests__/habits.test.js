const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const habits = require('../utils/habits');
const { renderHabitCard } = require('../utils/habitCard');
const habitCommand = require('../commands/habit');

beforeAll(() => initDatabase());

describe('streaks', () => {
    const days = list => new Set(list);

    test('daily streak counts back from today, or from yesterday if today is not done yet', () => {
        expect(habits.computeStreaks(days(['2026-10-10', '2026-10-11', '2026-10-12']), '2026-10-12').current).toBe(3);
        expect(habits.computeStreaks(days(['2026-10-10', '2026-10-11']), '2026-10-12').current).toBe(2);
        expect(habits.computeStreaks(days(['2026-10-09']), '2026-10-12').current).toBe(0);
    });

    test('best streak is the longest run', () => {
        const result = habits.computeStreaks(days(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-07', '2026-10-08']), '2026-10-12');
        expect(result.best).toBe(3);
    });

    test('weekly habits count weeks that reached the target', () => {
        // Weeks of Sep 28 and Oct 5 have 3 done days each; week of Oct 12 has 1 so far
        const done = days(['2026-09-28', '2026-09-30', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-08', '2026-10-12']);
        const result = habits.computeStreaks(done, '2026-10-12', 3);
        expect(result.unit).toBe('week');
        expect(result.current).toBe(2);
        expect(result.best).toBe(2);
    });
});

describe('habits and logs', () => {
    const user = 'habit_user';
    beforeEach(() => {
        db.exec("DELETE FROM habit_logs; DELETE FROM habits; DELETE FROM habit_settings;");
        getOrCreateUser(user);
        db.prepare('UPDATE users SET water = 0 WHERE discord_id = ?').run(user);
    });

    test('yes/no habits toggle and pay Water once', () => {
        const { habit } = habits.createHabit(user, { name: 'Read', emoji: '📖' });
        const first = habits.logHabit(user, habit.id, '2026-10-12', 1);
        expect(first).toMatchObject({ count: 1, done: true, rewarded: 1 });
        const undo = habits.logHabit(user, habit.id, '2026-10-12', 1);
        expect(undo.count).toBe(0);
        const again = habits.logHabit(user, habit.id, '2026-10-12', 1);
        expect(again.rewarded).toBe(0);
        expect(db.prepare('SELECT water FROM users WHERE discord_id = ?').get(user).water).toBe(1);
    });

    test('count habits are done when they reach the goal', () => {
        const { habit } = habits.createHabit(user, { name: 'Water', target: 3, unit: 'glasses' });
        habits.logHabit(user, habit.id, '2026-10-12', 1);
        const second = habits.logHabit(user, habit.id, '2026-10-12', 1);
        expect(second.done).toBe(false);
        const third = habits.logHabit(user, habit.id, '2026-10-12', 1);
        expect(third).toMatchObject({ count: 3, done: true, rewarded: 1 });
        expect(habits.logHabit(user, habit.id, '2026-10-12', -5).count).toBe(0);
    });

    test('rewards are capped per day', () => {
        for (let i = 0; i < 5; i++) {
            const { habit } = habits.createHabit(user, { name: `Habit ${i}` });
            habits.logHabit(user, habit.id, '2026-10-12', 1);
        }
        expect(db.prepare('SELECT water FROM users WHERE discord_id = ?').get(user).water).toBe(habits.DAILY_REWARD_CAP);
    });

    test('limit, duplicates and archiving', () => {
        for (let i = 0; i < habits.FREE_HABITS; i++) habits.createHabit(user, { name: `H${i}` });
        expect(habits.createHabit(user, { name: 'One more' }).error).toBe('limit');
        expect(habits.createHabit(user, { name: 'h0' }).error).toBe('limit');
        const first = habits.listHabits(user)[0];
        expect(habits.archiveHabit(user, first.id)).toBe(true);
        expect(habits.createHabit(user, { name: 'H1' }).error).toBe('duplicate');
        expect(habits.createHabit(user, { name: 'Fresh' }).habit).toBeTruthy();
    });

    test('time zones: own setting first, invalid zones rejected', () => {
        expect(habits.resolveTimeZone(user)).toBe('UTC');
        expect(habits.setTimeZone(user, 'Asia/Baku')).toBe('Asia/Baku');
        expect(habits.resolveTimeZone(user, 'any_guild')).toBe('Asia/Baku');
        expect(habits.setTimeZone(user, 'Not/AZone')).toBeNull();
    });

    test('overview lists the automatic focus habit first and renders a card', () => {
        habits.createHabit(user, { name: 'Read' });
        const overview = habits.buildHabitOverview(user);
        expect(overview.items[0].automatic).toBe(true);
        expect(overview.items[1].name).toBe('Read');

        const png = renderHabitCard(overview, {
            title: 'Habits',
            streakLabel: () => 'Streak 0',
            todayLabel: () => 'Today 0/1',
        });
        expect(png.subarray(1, 4).toString()).toBe('PNG');
    });
});

describe('/habit check buttons', () => {
    test('only the owner can tick their list', async () => {
        const interaction = {
            customId: 'habit_tick_owner_1',
            user: { id: 'someone_else' },
            locale: 'en',
            guildId: null,
            reply: jest.fn().mockResolvedValue({}),
            update: jest.fn(),
        };
        await habitCommand.handleHabitButton(interaction);
        expect(interaction.update).not.toHaveBeenCalled();
        expect(interaction.reply.mock.calls[0][0].flags).toBe(64);
    });
});
