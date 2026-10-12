const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_serverstats_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const { db, initDatabase, getOrCreateUser } = require('../utils/database');
const {
    getServerActivity,
    getTopContributor,
    formatChange,
} = require('../commands/serverstats');
const { generateServerStatsCard } = require('../utils/canvas');

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
        DELETE FROM voice_sessions;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM study_sessions;
        DELETE FROM users;
    `);
});

describe('/serverstats calculations', () => {
    test('compares current and previous seven-day focus activity', () => {
        getOrCreateUser('user_a');
        getOrCreateUser('user_b');
        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES
                ('user_a', 'guild_stats', 60, 'Current', datetime('now', '-1 day'), 1),
                ('user_b', 'guild_stats', 30, 'Previous', datetime('now', '-8 days'), 1)
        `).run();

        const activity = getServerActivity('guild_stats');
        const top = getTopContributor('guild_stats');

        expect(activity.current_minutes).toBe(60);
        expect(activity.previous_minutes).toBe(30);
        expect(activity.current_users).toBe(1);
        expect(activity.previous_users).toBe(1);
        expect(activity.current_sessions).toBe(1);
        expect(top).toMatchObject({ user_id: 'user_a', minutes: 60 });
        expect(formatChange(60, 30)).toBe('+100% vs previous week');
    });

    test('returns zeroes when the server has no activity', () => {
        const activity = getServerActivity('empty_guild');
        expect(activity).toMatchObject({
            current_minutes: 0,
            previous_minutes: 0,
            current_users: 0,
            previous_users: 0,
            current_sessions: 0,
            previous_sessions: 0,
        });
    });

    test('renders a public server progress card', async () => {
        const buffer = await generateServerStatsCard({
            guildName: 'Study Guild',
            activity: {
                current_minutes: 180,
                previous_minutes: 90,
                current_users: 6,
                current_sessions: 12,
            },
            commandUses: { uses: 42, users: 8 },
            topCommandText: '/study (20)',
            topContributorText: '3h focused',
            goalText: '3h / 10h',
            setupScore: '2/3',
        });

        expect(buffer.length).toBeGreaterThan(1000);
        expect(buffer.subarray(1, 4).toString()).toBe('PNG');
    });
});
