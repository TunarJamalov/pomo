const _test_os = require("os");
const _test_path = require("path");
if (!process.env.POMODORO_DB_PATH) {
    process.env.POMODORO_DB_PATH = _test_path.join(_test_os.tmpdir(), "test_" + Date.now() + "_" + Math.random() + ".db");
}
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_global_event_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    startGlobalEvent,
    getActiveGlobalEvent,
    getGlobalEventClues,
    recordGlobalEventProgress,
    getUserTitles,
    getRecentlyCompletedGlobalEvent,
} = require('../utils/database');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
        if (fs.existsSync(`${TEST_DB_PATH}-wal`)) fs.unlinkSync(`${TEST_DB_PATH}-wal`);
        if (fs.existsSync(`${TEST_DB_PATH}-shm`)) fs.unlinkSync(`${TEST_DB_PATH}-shm`);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM global_event_contributions;
        DELETE FROM global_event_clues;
        DELETE FROM global_events;
        DELETE FROM user_titles;
        DELETE FROM users;
    `);
});

describe('classified global events', () => {
    test('starts an event with staged clues', () => {
        const result = startGlobalEvent({
            eventKey: 'focus_protocol',
            title: 'The Focus Protocol',
            description: 'Classified signal detected.',
            targetMinutes: 100,
        });

        expect(result.success).toBe(true);
        expect(getActiveGlobalEvent().progress_minutes).toBe(0);
        expect(getGlobalEventClues(getActiveGlobalEvent().id)).toHaveLength(1);
    });

    test('records progress once, unlocks the event title, and completes', () => {
        startGlobalEvent({
            eventKey: 'focus_protocol',
            title: 'The Focus Protocol',
            description: 'Classified signal detected.',
            targetMinutes: 100,
        });

        const first = recordGlobalEventProgress({
            guildId: 'event_guild',
            userId: 'event_user',
            minutes: 50,
            sourceType: 'solo',
            sourceId: 'event_session_1',
        });
        const duplicate = recordGlobalEventProgress({
            guildId: 'event_guild',
            userId: 'event_user',
            minutes: 50,
            sourceType: 'solo',
            sourceId: 'event_session_1',
        });
        const second = recordGlobalEventProgress({
            guildId: 'event_guild',
            userId: 'event_user_2',
            minutes: 50,
            sourceType: 'voice',
            sourceId: 'event_session_2',
        });

        expect(first.recorded).toBe(true);
        expect(duplicate.duplicate).toBe(true);
        expect(second.completed).toBe(true);
        expect(getActiveGlobalEvent()).toBeNull();
        expect(getUserTitles('event_user').map(title => title.title_key)).toContain('protocol_pioneer');
        expect(getUserTitles('event_user_2').map(title => title.title_key)).toContain('protocol_pioneer');
    });
});

describe('themed events (1K celebration)', () => {
    test('uses the theme story and milestones instead of the classified ones', () => {
        const result = startGlobalEvent({
            eventKey: 'pomo_1k',
            title: 'Pomo 1K Celebration',
            description: 'ignored for themed events',
            targetMinutes: 1000,
        });

        expect(result.success).toBe(true);
        expect(result.event.description).toContain('1,000 servers');
        const clues = db.prepare('SELECT clue_key FROM global_event_clues WHERE event_id = ? ORDER BY threshold_minutes').all(result.event.id);
        expect(clues.map(c => c.clue_key)).toEqual(['kickoff', 'quarter', 'halfway', 'final_stretch', 'goal']);
    });

    test('participants earn the 1K Celebrant title and the finished event stays visible', () => {
        startGlobalEvent({ eventKey: 'pomo_1k', title: 'Pomo 1K Celebration', description: 'x', targetMinutes: 30 });

        const done = recordGlobalEventProgress({
            guildId: 'party_guild',
            userId: 'party_user',
            minutes: 30,
            sourceType: 'solo',
            sourceId: 'party_session_1',
        });

        expect(done.completed).toBe(true);
        expect(getUserTitles('party_user').map(t => t.key || t.title_key)).toContain('milestone_1k');
        expect(getActiveGlobalEvent()).toBeNull();
        expect(getRecentlyCompletedGlobalEvent(3).event_key).toBe('pomo_1k');
    });
});
