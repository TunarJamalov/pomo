const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { grantProAccess } = require('../utils/premiumManager');
const { getBestHour, pickNudge, runAssistant, setAssistantEnabled } = require('../utils/assistant');
const { nextOccurrence } = require('../commands/assistant');

const PRO = '300000000000000001';
const PLUS = '300000000000000002';
// A fixed "now": Wednesday 2026-10-14
const at = hour => new Date(Date.UTC(2026, 9, 14, hour, 5));

function session(userId, startedAt, minutes = 25) {
    db.prepare("INSERT INTO study_sessions (user_id, guild_id, duration, title, started_at, completed) VALUES (?, 'g', ?, 'Focus', ?, 1)")
        .run(userId, minutes, startedAt);
}
const userRow = id => db.prepare('SELECT discord_id, assistant_last_dm_date, assistant_exam_alerts FROM users WHERE discord_id = ?').get(id);

beforeAll(() => initDatabase());
beforeEach(() => {
    db.exec(`
        DELETE FROM study_sessions WHERE user_id LIKE '3000%';
        DELETE FROM user_exams WHERE user_id LIKE '3000%';
        DELETE FROM premium_entitlements WHERE user_id LIKE '3000%';
    `);
    [PRO, PLUS].forEach(getOrCreateUser);
    db.prepare("UPDATE users SET assistant_enabled = 0, assistant_last_dm_date = NULL, assistant_exam_alerts = '' WHERE discord_id LIKE '3000%'").run();
    grantProAccess(PRO, 30, 'test', { planKey: 'pro' });
    grantProAccess(PLUS, 30, 'test', { planKey: 'plus' });
});

describe('best study hour', () => {
    test('needs 5 sessions, then picks the hour with the most minutes', () => {
        for (let d = 1; d <= 4; d++) session(PRO, `2026-10-0${d} 19:10:00`);
        expect(getBestHour(PRO, at(12))).toBeNull();
        session(PRO, '2026-10-05 19:10:00');
        session(PRO, '2026-10-06 08:00:00', 50);
        expect(getBestHour(PRO, at(12))).toBe(19);
    });

    test('nudges at that hour only if the user has not studied today', () => {
        for (let d = 1; d <= 6; d++) session(PRO, `2026-10-0${d} 19:10:00`);
        expect(pickNudge(userRow(PRO), at(18))).toBeNull();
        expect(pickNudge(userRow(PRO), at(19))).toMatchObject({ kind: 'best_hour' });

        session(PRO, '2026-10-14 07:00:00');
        expect(pickNudge(userRow(PRO), at(19))).toBeNull();
    });

    test('the status time is the next time that hour comes round', () => {
        expect(nextOccurrence(19, at(12))).toBe(`<t:${Date.UTC(2026, 9, 14, 19) / 1000}:t>`);
        expect(nextOccurrence(8, at(12))).toBe(`<t:${Date.UTC(2026, 9, 15, 8) / 1000}:t>`);
    });
});

describe('exam coach', () => {
    test('3 days before, with hours left per day, only at 16:00 UTC', () => {
        db.prepare("INSERT INTO user_exams (user_id, title, exam_date, target_hours, created_at) VALUES (?, 'Math', '2026-10-17', 10, '2026-10-01 00:00:00')").run(PRO);
        session(PRO, '2026-10-10 10:00:00', 240);

        const nudge = pickNudge(userRow(PRO), at(16));
        expect(nudge).toMatchObject({ kind: 'exam', key: 'assistantExamBody', vars: { title: 'Math', days: 3, done: '4.0', target: 10, perDay: '2.0' } });
        expect(pickNudge(userRow(PRO), at(15))?.kind).not.toBe('exam');
    });
});

describe('comeback nudge', () => {
    test('a 4-day-a-week regular away for 2 days hears from the assistant at 18:00', () => {
        const days = [
            '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19',
            '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
            '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02',
            '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-12',
        ];
        for (const day of days) session(PRO, `${day} 12:00:00`);
        expect(pickNudge(userRow(PRO), at(18))).toMatchObject({ kind: 'comeback', vars: { days: 4 } });
    });
});

describe('the hourly job', () => {
    test('sends one DM a day, only to opted-in Pro users', async () => {
        for (const id of [PRO, PLUS]) {
            for (let d = 1; d <= 6; d++) session(id, `2026-10-0${d} 19:10:00`);
            setAssistantEnabled(id, true);
        }
        const send = jest.fn().mockResolvedValue({});
        const client = { users: { fetch: jest.fn().mockResolvedValue({ send }) } };

        expect(await runAssistant(client, at(19))).toBe(1);
        expect(client.users.fetch).toHaveBeenCalledWith(PRO);
        expect(await runAssistant(client, at(19))).toBe(0);
        expect(send).toHaveBeenCalledTimes(1);
    });

    test('nothing when the user has not turned it on', async () => {
        for (let d = 1; d <= 6; d++) session(PRO, `2026-10-0${d} 19:10:00`);
        const client = { users: { fetch: jest.fn() } };
        expect(await runAssistant(client, at(19))).toBe(0);
        expect(client.users.fetch).not.toHaveBeenCalled();
    });
});
