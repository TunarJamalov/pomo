const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadImage } = require('@napi-rs/canvas');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_stats_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
} = require('../utils/database');
const { getAdvancedStatsData } = require('../commands/stats');
const { generateStatsDashboard } = require('../utils/canvas');

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
        DELETE FROM harvested_items;
        DELETE FROM voice_sessions;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM study_sessions;
        DELETE FROM users;
    `);
});

describe('Pomo Pro advanced analytics', () => {
    test('combines solo, team, and voice activity into 7/30/90-day periods', () => {
        getOrCreateUser('stats_user');
        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, subject, started_at, completed
            ) VALUES
                ('stats_user', 'guild', 25, 'Today', 'math', '2026-06-10 08:00:00', 1),
                ('stats_user', 'guild', 5, '__break__', 'math', '2026-06-10 09:00:00', 1),
                ('stats_user', 'guild', 30, 'Old edge', 'reading', '2026-05-12 08:00:00', 1),
                ('stats_user', 'guild', 40, 'Outside 30', 'coding', '2026-05-11 08:00:00', 1)
        `).run();
        const teamId = db.prepare(`
            INSERT INTO team_sessions (
                guild_id, channel_id, host_id, duration, started_at, status
            ) VALUES ('guild', 'channel', 'stats_user', 50, '2026-06-09 08:00:00', 'completed')
        `).run().lastInsertRowid;
        db.prepare(
            'INSERT INTO team_members (session_id, user_id) VALUES (?, ?)'
        ).run(teamId, 'stats_user');
        db.prepare(`
            INSERT INTO voice_sessions (
                user_id, guild_id, channel_id, started_at, ended_at,
                credited_minutes, status
            ) VALUES (
                'stats_user', 'guild', 'voice', '2026-06-08 07:30:00',
                '2026-06-08 08:00:00', 20, 'completed'
            )
        `).run();
        db.prepare(
            "INSERT INTO harvested_items (user_id, plant_type) VALUES ('stats_user', 'tomato')"
        ).run();

        const now = new Date('2026-06-10T12:00:00Z');
        const seven = getAdvancedStatsData('stats_user', 7, now);
        const thirty = getAdvancedStatsData('stats_user', 30, now);
        const ninety = getAdvancedStatsData('stats_user', 90, now);

        expect(seven).toMatchObject({
            periodDays: 7,
            periodSessions: 3,
            periodMinutes: 95,
            activeDays: 3,
            avgLength: 32,
        });
        expect(thirty).toMatchObject({
            periodDays: 30,
            periodSessions: 4,
            periodMinutes: 125,
            activeDays: 4,
            avgLength: 31,
            totalHarvests: 1,
        });
        expect(thirty.bestDay).toMatchObject({ date: '2026-06-09', minutes: 50 });
        expect(thirty.topSubjects).toEqual([
            expect.objectContaining({ subject: 'reading', minutes: 30, sessions: 1, percent: 55 }),
            expect.objectContaining({ subject: 'math', minutes: 25, sessions: 1, percent: 45 }),
        ]);
        expect(ninety.periodSessions).toBe(5);
        expect(ninety.periodMinutes).toBe(165);
    });

    test('fills inactive dates and defaults invalid periods to 30 days', () => {
        getOrCreateUser('empty_user');
        const data = getAdvancedStatsData(
            'empty_user',
            14,
            new Date('2026-06-10T12:00:00Z'),
        );

        expect(data.periodDays).toBe(30);
        expect(data.days).toHaveLength(30);
        expect(data.days[0].date).toBe('2026-05-12');
        expect(data.days[29].date).toBe('2026-06-10');
        expect(data.periodMinutes).toBe(0);
        expect(data.bestDay.minutes).toBe(0);
    });

    test.each([7, 30, 90])('renders a non-empty %i-day analytics image', async periodDays => {
        const user = getOrCreateUser(`canvas_${periodDays}`);
        const data = getAdvancedStatsData(
            user.discord_id,
            periodDays,
            new Date('2026-06-10T12:00:00Z'),
        );
        const buffer = await generateStatsDashboard(
            { username: 'Heatmap Tester' },
            user,
            data,
            true,
        );
        const image = await loadImage(buffer);

        expect(buffer.length).toBeGreaterThan(1000);
        expect(image.width).toBe(800);
        expect(image.height).toBe(680);
    });
});
