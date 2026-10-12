const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_streak_recovery_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
    updateUser,
    recordStreakBreak,
    getStreakRecoveryStatus,
    recoverStreak,
    recoverStreakWithWater,
} = require('../utils/database');
const streakCommand = require('../commands/streak');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec('DELETE FROM streak_breaks; DELETE FROM users;');
});

describe('Pomo Pro Streak Recovery', () => {
    const brokenAt = new Date('2026-06-10T12:00:00Z');

    test('records only recent meaningful streak breaks', () => {
        expect(recordStreakBreak('short_streak', 1, 2, brokenAt)).toBeNull();
        expect(recordStreakBreak('long_gap', 20, 4, brokenAt)).toBeNull();

        const candidate = recordStreakBreak('eligible', 20, 2, brokenAt);
        expect(candidate).toMatchObject({
            previous_streak: 20,
            gap_days: 2,
            broken_at: '2026-06-10 12:00:00',
            expires_at: '2026-06-12 12:00:00',
        });
    });

    test('restores the old streak plus current post-break days', () => {
        getOrCreateUser('recover_user');
        updateUser('recover_user', { streak: 2 });
        recordStreakBreak('recover_user', 25, 2, brokenAt);

        const result = recoverStreak('recover_user', new Date('2026-06-11T10:00:00Z'));
        expect(result).toMatchObject({
            ok: true,
            previousStreak: 25,
            currentStreak: 2,
            restoredStreak: 27,
        });
        expect(getOrCreateUser('recover_user').streak).toBe(27);
    });

    test('expires after 48 hours and cannot be claimed twice', () => {
        recordStreakBreak('expired_user', 12, 3, brokenAt);
        expect(getStreakRecoveryStatus(
            'expired_user',
            new Date('2026-06-12T12:00:01Z')
        ).available).toBe(false);
        expect(recoverStreak(
            'expired_user',
            new Date('2026-06-12T12:00:01Z')
        ).reason).toBe('none');

        recordStreakBreak('once_user', 12, 2, brokenAt);
        expect(recoverStreak('once_user', new Date('2026-06-11T00:00:00Z')).ok).toBe(true);
        expect(recoverStreak('once_user', new Date('2026-06-11T00:00:01Z')).ok).toBe(false);
    });

    test('enforces a 30-day cooldown between recoveries', () => {
        recordStreakBreak('cooldown_user', 8, 2, brokenAt);
        expect(recoverStreak('cooldown_user', new Date('2026-06-10T13:00:00Z')).ok).toBe(true);

        recordStreakBreak('cooldown_user', 10, 2, new Date('2026-06-20T12:00:00Z'));
        const blocked = recoverStreak('cooldown_user', new Date('2026-06-20T13:00:00Z'));
        expect(blocked.reason).toBe('cooldown');
        expect(blocked.cooldownEndsAt).toBe('2026-07-10 13:00:00');
    });

    test('publishes status, recover, and repair subcommands', () => {
        const names = streakCommand.data.toJSON().options.map(option => option.name);
        expect(names).toEqual(['status', 'recover', 'repair']);
    });

    test('repairs a broken streak by spending 50 water', () => {
        getOrCreateUser('water_user');
        updateUser('water_user', { streak: 2, water: 80 });
        recordStreakBreak('water_user', 15, 2, brokenAt);

        const result = recoverStreakWithWater('water_user', 50, new Date('2026-06-11T10:00:00Z'));
        expect(result).toMatchObject({
            ok: true,
            previousStreak: 15,
            currentStreak: 2,
            restoredStreak: 17,
            waterSpent: 50,
        });
        const user = getOrCreateUser('water_user');
        expect(user.streak).toBe(17);
        expect(user.water).toBe(30);
    });

    test('rejects water repair when user has insufficient water', () => {
        getOrCreateUser('poor_user');
        updateUser('poor_user', { streak: 1, water: 10 });
        recordStreakBreak('poor_user', 12, 2, brokenAt);

        const result = recoverStreakWithWater('poor_user', 50, new Date('2026-06-11T10:00:00Z'));
        expect(result).toMatchObject({
            ok: false,
            reason: 'insufficient_water',
            waterNeeded: 50,
            userWater: 10,
        });
        expect(getOrCreateUser('poor_user').streak).toBe(1);
        expect(getOrCreateUser('poor_user').water).toBe(10);
    });
});
