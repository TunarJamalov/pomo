const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_weekly_report_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
} = require('../utils/database');
const {
    generateWeeklyReportEmbed,
    getWeeklyReportData,
} = require('../utils/weeklyReport');

const REPORT_WINDOW = {
    startDate: '2026-06-08',
    endDate: '2026-06-14',
    timeZone: 'UTC',
    startUtc: new Date('2026-06-08T00:00:00Z'),
    endUtc: new Date('2026-06-15T00:00:00Z'),
};

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
        DELETE FROM guild_goal_contributions;
        DELETE FROM guild_goals;
        DELETE FROM voice_sessions;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM study_sessions;
        DELETE FROM users;
    `);
});

describe('weekly report', () => {
    test('returns null when a server has no report activity', () => {
        expect(generateWeeklyReportEmbed('empty_guild', 'Empty Guild', { window: REPORT_WINDOW })).toBeNull();
    });

    test('summarizes solo, team, voice, subjects, and weekly goal progress', () => {
        for (const userId of ['user_a', 'user_b', 'user_c']) {
            getOrCreateUser(userId);
        }

        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, subject, started_at, completed
            ) VALUES
                ('user_a', 'report_guild', 50, 'Math review', 'math', '2026-06-09 10:00:00', 1),
                ('user_b', 'report_guild', 25, 'Reading', 'reading', '2026-06-10 10:00:00', 1),
                ('user_a', 'report_guild', 5, '__break__', 'general', '2026-06-10 10:30:00', 1)
        `).run();

        const teamId = db.prepare(`
            INSERT INTO team_sessions (
                guild_id, channel_id, host_id, duration, started_at, status
            ) VALUES ('report_guild', 'channel', 'user_a', 30, '2026-06-11 10:00:00', 'completed')
        `).run().lastInsertRowid;
        db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(teamId, 'user_a');
        db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(teamId, 'user_c');

        db.prepare(`
            INSERT INTO voice_sessions (
                user_id, guild_id, channel_id, started_at, ended_at, credited_minutes, status
            ) VALUES
                ('user_c', 'report_guild', 'voice', '2026-06-12 10:00:00', '2026-06-12 11:00:00', 60, 'completed')
        `).run();

        const goalId = db.prepare(`
            INSERT INTO guild_goals (
                guild_id, week_start, target_minutes, reward_water, reward_xp, min_contribution, channel_id
            ) VALUES ('report_guild', '2026-06-08', 200, 3, 15, 25, 'goal_channel')
        `).run().lastInsertRowid;
        db.prepare(`
            INSERT INTO guild_goal_contributions (
                goal_id, user_id, minutes, source_type, source_id
            ) VALUES
                (?, 'user_a', 80, 'solo', '1'),
                (?, 'user_c', 60, 'voice', '1')
        `).run(goalId, goalId);

        const data = getWeeklyReportData('report_guild', REPORT_WINDOW);
        expect(data).toMatchObject({
            totalMinutes: 195,
            totalSessions: 4,
            activeStudents: 3,
        });
        expect(data.breakdown.solo).toMatchObject({ minutes: 75, sessions: 2 });
        expect(data.breakdown.team).toMatchObject({ minutes: 60, sessions: 1, contributions: 2 });
        expect(data.breakdown.voice).toMatchObject({ minutes: 60, sessions: 1 });

        const embed = generateWeeklyReportEmbed('report_guild', 'Report Guild', { window: REPORT_WINDOW });
        const json = embed.toJSON();
        const fields = Object.fromEntries(json.fields.map(field => [field.name, field.value]));

        expect(json.description).toContain('3h 15m');
        expect(fields['Focus Breakdown']).toContain('Solo');
        expect(fields['Top Subjects']).toContain('Math');
        expect(fields['Top Voice Focus']).toContain('<@user_c>');
        expect(fields['Weekly Goal']).toContain('70%');
    });
});
