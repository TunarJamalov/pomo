jest.mock('../utils/timerManager', () => ({
    startStudyTimer: jest.fn(),
    recoverSessions: jest.fn(),
    clearTimers: jest.fn(),
}));

const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { startStudyTimer } = require('../utils/timerManager');
const { processActivityCommands } = require('../events/ready');

const USER = '340000000000000001';
const FOREIGN_CHANNEL = '340000000000000099';

function queue(type, extra = null) {
    return db.prepare(`
        INSERT INTO activity_commands (user_id, channel_id, minutes, status, type, extra_data, created_at)
        VALUES (?, ?, 25, 'pending', ?, ?, datetime('now'))
    `).run(USER, FOREIGN_CHANNEL, type, extra).lastInsertRowid;
}
const statusOf = id => db.prepare('SELECT status FROM activity_commands WHERE id = ?').get(id).status;

function client({ dmOpen = true } = {}) {
    const dm = { id: 'dm-channel-1', send: jest.fn().mockResolvedValue({ id: 'timer-message-1' }) };
    return {
        dm,
        channels: { fetch: jest.fn().mockRejectedValue(new Error('Unknown Channel')) },
        users: { createDM: dmOpen ? jest.fn().mockResolvedValue(dm) : jest.fn().mockRejectedValue(new Error('Cannot send')) },
        commands: new Map(),
    };
}

beforeAll(() => initDatabase());
beforeEach(() => {
    db.prepare("DELETE FROM activity_commands WHERE user_id = ?").run(USER);
    db.prepare("DELETE FROM study_sessions WHERE user_id = ?").run(USER);
    getOrCreateUser(USER);
    startStudyTimer.mockClear();
});

describe('Discord Activity commands where the bot is not in the server', () => {
    test('a study timer runs in the user\'s DMs instead of failing', async () => {
        const id = queue('study');
        const c = client();
        await processActivityCommands(c);

        expect(statusOf(id)).toBe('processed');
        const session = db.prepare('SELECT guild_id, channel_id, message_id FROM study_sessions WHERE user_id = ?').get(USER);
        expect(session).toEqual({ guild_id: null, channel_id: 'dm-channel-1', message_id: 'timer-message-1' });
        expect(c.dm.send).toHaveBeenCalled();
        expect(startStudyTimer).toHaveBeenCalled();
    });

    test('closed DMs are recorded as their own failure', async () => {
        const id = queue('study');
        await processActivityCommands(client({ dmOpen: false }));
        expect(statusOf(id)).toBe('failed_dm_closed');
        expect(startStudyTimer).not.toHaveBeenCalled();
    });

    test('Stop works without the channel; team sessions still need a server', async () => {
        const stop = queue('stop');
        const team = queue('create_team');
        await processActivityCommands(client());
        expect(statusOf(stop)).toBe('processed');
        expect(statusOf(team)).toBe('failed_channel_not_found');
    });
});
