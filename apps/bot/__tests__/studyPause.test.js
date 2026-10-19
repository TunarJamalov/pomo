// A paused or resumed /study session must finish on its real schedule, whatever
// timers from before the pause still think (bug report: paused, yet it finished early)
const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { startStudyTimer, pauseStudySession, resumeStudySession, clearTimers } = require('../utils/timerManager');

const USER = '400000000000000001';
const sql = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
const client = {
    channels: { fetch: () => Promise.resolve(null) },
    users: { fetch: () => Promise.resolve(null) },
    guilds: { cache: new Map(), fetch: () => Promise.resolve(null) },
};

function createSession(minutes = 25) {
    const now = Date.now();
    const id = db.prepare(`
        INSERT INTO study_sessions (user_id, guild_id, channel_id, message_id, duration, title, started_at, ends_at)
        VALUES (?, 'g', 'c', NULL, ?, 'Focus', ?, ?)
    `).run(USER, minutes, sql(now), sql(now + minutes * 60000)).lastInsertRowid;
    return db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(id);
}
const row = id => db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(id);
const minutes = n => n * 60000;

beforeAll(() => initDatabase());
beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-10-19T10:00:00Z') });
    db.prepare('DELETE FROM study_sessions WHERE user_id = ?').run(USER);
    getOrCreateUser(USER);
});
afterEach(() => {
    jest.useRealTimers();
});

test('a paused session does not finish when its old end time passes', async () => {
    const session = createSession(25);
    startStudyTimer(client, session);
    await jest.advanceTimersByTimeAsync(minutes(10));
    await pauseStudySession(client, row(session.id));

    await jest.advanceTimersByTimeAsync(minutes(14));
    expect(row(session.id)).toMatchObject({ completed: 0, paused: 1 });
    clearTimers(session.id);
});

test('a timer left over from before a pause cannot finish the session', async () => {
    const session = createSession(25);
    startStudyTimer(client, session);
    // The session is paused in the database while the old timers keep running (the race behind the report)
    db.prepare('UPDATE study_sessions SET paused = 1, paused_at = ? WHERE id = ?').run(sql(Date.now()), session.id);

    await jest.advanceTimersByTimeAsync(minutes(31));
    expect(row(session.id).completed).toBe(0);
    clearTimers(session.id);
});

test('after a resume the session finishes at its new, later end', async () => {
    const session = createSession(25);
    startStudyTimer(client, session);
    await jest.advanceTimersByTimeAsync(minutes(10));
    await pauseStudySession(client, row(session.id));
    await jest.advanceTimersByTimeAsync(minutes(5));
    await resumeStudySession(client, row(session.id));

    // Old end (25 min after start) passes: still running
    await jest.advanceTimersByTimeAsync(minutes(12));
    expect(row(session.id).completed).toBe(0);
    // New end (25 + 5 paused) passes: finished
    await jest.advanceTimersByTimeAsync(minutes(4));
    expect(row(session.id).completed).toBe(1);
});

test('a stale timer for a session whose end moved later puts it back on the clock', async () => {
    const session = createSession(25);
    startStudyTimer(client, session);
    // End moved 10 minutes later without the timers knowing
    db.prepare('UPDATE study_sessions SET ends_at = ? WHERE id = ?').run(sql(Date.now() + minutes(35)), session.id);

    await jest.advanceTimersByTimeAsync(minutes(26));
    expect(row(session.id).completed).toBe(0);
    await jest.advanceTimersByTimeAsync(minutes(10));
    expect(row(session.id).completed).toBe(1);
});
