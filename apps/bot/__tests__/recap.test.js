const path = require('path');
const fs = require('fs');
const os = require('os');
const { loadImage } = require('@napi-rs/canvas');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_recap_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
} = require('../utils/database');
const { getWeeklyRecapData } = require('../commands/recap');
const { generateWeeklyRecap } = require('../utils/canvas');

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

describe('weekly recap', () => {
    test('combines the last seven UTC days by source', () => {
        getOrCreateUser('recap_user');
        db.prepare(`
            INSERT INTO study_sessions (user_id, duration, title, started_at, completed)
            VALUES
                ('recap_user', 25, 'Math', '2026-06-15 08:00:00', 1),
                ('recap_user', 5, '__break__', '2026-06-15 08:30:00', 1),
                ('recap_user', 60, 'Old', '2026-06-08 08:00:00', 1)
        `).run();
        const teamId = db.prepare(`
            INSERT INTO team_sessions (guild_id, channel_id, host_id, duration, started_at, status)
            VALUES ('guild', 'channel', 'recap_user', 50, '2026-06-14 08:00:00', 'completed')
        `).run().lastInsertRowid;
        db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)')
            .run(teamId, 'recap_user');
        db.prepare(`
            INSERT INTO voice_sessions (
                user_id, guild_id, channel_id, started_at, ended_at, credited_minutes, status
            ) VALUES (
                'recap_user', 'guild', 'voice', '2026-06-13 08:00:00',
                '2026-06-13 08:30:00', 30, 'completed'
            )
        `).run();

        const recap = getWeeklyRecapData('recap_user', new Date('2026-06-15T12:00:00Z'));
        expect(recap).toMatchObject({
            startDate: '2026-06-09',
            endDate: '2026-06-15',
            periodSessions: 3,
            periodMinutes: 105,
            activeDays: 3,
            avgLength: 35,
            sources: { solo: 1, team: 1, voice: 1 },
        });
        expect(recap.bestDay).toMatchObject({ date: '2026-06-14', minutes: 50 });
    });

    test('renders a shareable 900x540 image', async () => {
        const user = getOrCreateUser('recap_canvas');
        const recap = getWeeklyRecapData('recap_canvas', new Date('2026-06-15T12:00:00Z'));
        const buffer = await generateWeeklyRecap({
            username: 'Focus Student',
            displayAvatarURL: () => 'invalid://avatar',
        }, user, recap);
        const image = await loadImage(buffer);

        expect(buffer.length).toBeGreaterThan(1000);
        expect(image.width).toBe(900);
        expect(image.height).toBe(540);
    });
});
