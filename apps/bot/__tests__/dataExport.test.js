const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_export_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateUser,
} = require('../utils/database');
const {
    normalizePeriod,
    getFocusExportRows,
    buildFocusCsv,
    escapeCsvCell,
} = require('../commands/dataexport');

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

describe('Pomo Pro CSV data export', () => {
    test('combines only the requesting user completed focus history', () => {
        getOrCreateUser('export_user');
        getOrCreateUser('other_user');
        db.prepare(`
            INSERT INTO study_sessions (
                user_id, guild_id, duration, title, started_at, completed
            ) VALUES
                ('export_user', 'guild_1', 25, 'Math, chapter 2', '2026-06-09 08:00:00', 1),
                ('export_user', 'guild_1', 5, '__break__', '2026-06-09 09:00:00', 1),
                ('export_user', 'guild_1', 30, 'Incomplete', '2026-06-09 10:00:00', 0),
                ('other_user', 'guild_1', 90, 'Private', '2026-06-09 11:00:00', 1),
                ('export_user', 'guild_1', 45, 'Outside', '2025-01-01 08:00:00', 1)
        `).run();
        const teamId = db.prepare(`
            INSERT INTO team_sessions (
                guild_id, channel_id, host_id, duration, started_at, status
            ) VALUES ('guild_2', 'channel', 'export_user', 50, '2026-06-08 08:00:00', 'completed')
        `).run().lastInsertRowid;
        db.prepare(
            'INSERT INTO team_members (session_id, user_id) VALUES (?, ?)'
        ).run(teamId, 'export_user');
        db.prepare(`
            INSERT INTO voice_sessions (
                user_id, guild_id, channel_id, started_at, ended_at,
                credited_minutes, status
            ) VALUES
                ('export_user', 'guild_3', 'voice', '2026-06-07 07:00:00',
                 '2026-06-07 08:00:00', 40, 'completed'),
                ('export_user', 'guild_3', 'voice', '2026-06-06 07:00:00',
                 '2026-06-06 08:00:00', 0, 'completed')
        `).run();

        const rows = getFocusExportRows(
            'export_user',
            30,
            new Date('2026-06-10T12:00:00Z'),
        );

        expect(rows).toHaveLength(3);
        expect(rows.map(row => row.source)).toEqual(['solo', 'team', 'voice']);
        expect(rows.reduce((sum, row) => sum + row.duration_minutes, 0)).toBe(115);
        expect(rows.some(row => row.title === 'Private')).toBe(false);
    });

    test('escapes commas, quotes, line breaks, and spreadsheet formulas', () => {
        expect(escapeCsvCell('Math, chapter 2')).toBe('"Math, chapter 2"');
        expect(escapeCsvCell('He said "focus"')).toBe('"He said ""focus"""');
        expect(escapeCsvCell('line one\nline two')).toBe('line one line two');
        expect(escapeCsvCell('=HYPERLINK("bad")')).toBe('"\'=HYPERLINK(""bad"")"');
        expect(escapeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    });

    test('builds a stable CRLF CSV with all columns', () => {
        const csv = buildFocusCsv([{
            date: '2026-06-10',
            started_at_utc: '2026-06-10 08:00:00',
            source: 'solo',
            duration_minutes: 25,
            title: 'Study',
            guild_id: 'guild',
        }]);

        expect(csv).toBe(
            'date,started_at_utc,source,duration_minutes,title,guild_id\r\n' +
            '2026-06-10,2026-06-10 08:00:00,solo,25,Study,guild\r\n'
        );
    });

    test('allows only supported periods and defaults invalid input to 90', () => {
        expect(normalizePeriod(30)).toBe(30);
        expect(normalizePeriod(90)).toBe(90);
        expect(normalizePeriod(365)).toBe(365);
        expect(normalizePeriod(7)).toBe(90);
    });
});
