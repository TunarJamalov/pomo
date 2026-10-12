/**
 * Tests for utils/database.js — tests against a real SQLite temp DB.
 * Uses POMODORO_DB_PATH env var to redirect the DB path.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

// Set the env var BEFORE requiring database (since database.js reads it at module load time)
const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_test_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

// Now require the module — it will use our temp path
const {
    db,
    initDatabase,
    getOrCreateUser,
    updateUser,
    incrementUser,
    getOrCreateSettings,
    createSession,
    getActiveSessions,
    getActiveSessionForUser,
    completeSession,
    deleteSession,
    markReminderSent,
    getPastSessionTitles,
    updateSessionPomodoroData,
    getFriends,
    getPendingRequests,
    sendFriendRequest,
    acceptFriendRequest,
    removeFriend,
    canNotifyFriend,
} = require('../utils/database');

beforeAll(() => {
    initDatabase();
});

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM friends;
        DELETE FROM user_achievements;
        DELETE FROM inventory;
        DELETE FROM settings;
        DELETE FROM study_sessions;
        DELETE FROM garden_plots;
        DELETE FROM harvested_items;
        DELETE FROM team_members;
        DELETE FROM team_sessions;
        DELETE FROM users;
    `);
});

// ── User helpers ───────────────────────────────────────────────

describe('getOrCreateUser', () => {
    test('creates a new user on first call', () => {
        const user = getOrCreateUser('user_001');
        expect(user).not.toBeNull();
        expect(user.discord_id).toBe('user_001');
        expect(user.water).toBe(0);
        expect(user.level).toBe(1);
    });

    test('returns the same user on second call', () => {
        getOrCreateUser('user_002');
        const user = getOrCreateUser('user_002');
        expect(user.discord_id).toBe('user_002');
    });

    test('new user has default values', () => {
        const user = getOrCreateUser('user_003');
        expect(user.xp).toBe(0);
        expect(user.streak).toBe(0);
        expect(user.premium).toBe(0);
        expect(user.bio).toBe('');
        expect(user.theme).toBe('basic');
    });
});

describe('updateUser', () => {
    test('updates a single field', () => {
        getOrCreateUser('user_upd_1');
        updateUser('user_upd_1', { bio: 'Hello world' });
        const user = getOrCreateUser('user_upd_1');
        expect(user.bio).toBe('Hello world');
    });

    test('updates multiple fields at once', () => {
        getOrCreateUser('user_upd_2');
        updateUser('user_upd_2', { streak: 5, theme: 'dark' });
        const user = getOrCreateUser('user_upd_2');
        expect(user.streak).toBe(5);
        expect(user.theme).toBe('dark');
    });
});

describe('incrementUser', () => {
    test('increments water field', () => {
        getOrCreateUser('user_inc_1');
        incrementUser('user_inc_1', 'water', 3);
        const user = getOrCreateUser('user_inc_1');
        expect(user.water).toBe(3);
    });

    test('increments xp field cumulatively', () => {
        getOrCreateUser('user_inc_2');
        incrementUser('user_inc_2', 'xp', 10);
        incrementUser('user_inc_2', 'xp', 25);
        const user = getOrCreateUser('user_inc_2');
        expect(user.xp).toBe(35);
    });

    test('increments total_focus_minutes', () => {
        getOrCreateUser('user_inc_3');
        incrementUser('user_inc_3', 'total_focus_minutes', 60);
        const user = getOrCreateUser('user_inc_3');
        expect(user.total_focus_minutes).toBe(60);
    });
});

// ── Settings helpers ───────────────────────────────────────────

describe('getOrCreateSettings', () => {
    test('creates default settings for new user', () => {
        getOrCreateUser('user_set_1');
        const settings = getOrCreateSettings('user_set_1');
        expect(settings).not.toBeNull();
        expect(settings.notify_before_end).toBe(1);
        expect(settings.notify_type).toBe('dm');
        expect(settings.reminders_enabled).toBe(1);
    });

    test('returns existing settings on second call', () => {
        getOrCreateUser('user_set_2');
        getOrCreateSettings('user_set_2');
        const settings = getOrCreateSettings('user_set_2');
        expect(settings.user_id).toBe('user_set_2');
    });
});

// ── Session helpers ────────────────────────────────────────────

describe('createSession and getActiveSessions', () => {
    test('creates a session and appears in getActiveSessions', () => {
        getOrCreateUser('user_ses_1');
        createSession('user_ses_1', 'guild_1', 'channel_1', 'msg_1', 25, 'Test Session');
        const sessions = getActiveSessions();
        expect(sessions.length).toBeGreaterThanOrEqual(1);
        const session = sessions.find(s => s.user_id === 'user_ses_1');
        expect(session).not.toBeUndefined();
        expect(session.duration).toBe(25);
        expect(session.title).toBe('Test Session');
        expect(session.completed).toBe(0);
    });
});

describe('getActiveSessionForUser', () => {
    test('returns undefined when user has no active session', () => {
        getOrCreateUser('user_nos_1');
        const session = getActiveSessionForUser('user_nos_1');
        expect(session).toBeUndefined();
    });

    test('returns the session when user has one', () => {
        getOrCreateUser('user_ses_2');
        createSession('user_ses_2', 'guild_1', 'channel_1', 'msg_2', 50, 'My Session');
        const session = getActiveSessionForUser('user_ses_2');
        expect(session).not.toBeNull();
        expect(session.user_id).toBe('user_ses_2');
        expect(session.duration).toBe(50);
    });
});

describe('completeSession', () => {
    test('marks session as completed — no longer appears as active', () => {
        getOrCreateUser('user_cmp_1');
        const id = createSession('user_cmp_1', 'g', 'c', 'm', 25, 'Finish Me');
        completeSession(id);
        const session = getActiveSessionForUser('user_cmp_1');
        expect(session).toBeUndefined();
    });
});

describe('deleteSession', () => {
    test('removes the session from the DB entirely', () => {
        getOrCreateUser('user_del_1');
        const id = createSession('user_del_1', 'g', 'c', 'm', 25, 'Delete Me');
        deleteSession(id);
        const sessions = getActiveSessions();
        const found = sessions.find(s => s.id === id);
        expect(found).toBeUndefined();
    });
});

describe('markReminderSent', () => {
    test('sets reminder_sent to 1', () => {
        getOrCreateUser('user_rem_1');
        const id = createSession('user_rem_1', 'g', 'c', 'm', 30, 'Remind Me');
        markReminderSent(id);
        const session = getActiveSessionForUser('user_rem_1');
        expect(session.reminder_sent).toBe(1);
    });
});

describe('getPastSessionTitles', () => {
    test('returns empty array when user has no sessions', () => {
        expect(getPastSessionTitles('user_ac_1')).toEqual([]);
    });

    test('returns unique titles, excluding __break__ and default Study Session', () => {
        getOrCreateUser('user_ac_2');
        createSession('user_ac_2', 'g', 'c', 'm', 25, 'Math Homework');
        createSession('user_ac_2', 'g', 'c', 'm', 25, 'Physics Setup');

        // Should be excluded
        createSession('user_ac_2', 'g', 'c', 'm', 5, '__break__');
        createSession('user_ac_2', 'g', 'c', 'm', 25, 'Study Session');
        createSession('user_ac_2', 'g', 'c', 'm', 25, null);

        // Duplicate
        createSession('user_ac_2', 'g', 'c', 'm', 30, 'Math Homework');

        const titles = getPastSessionTitles('user_ac_2');

        // Sorted by ID DESC (newest first), unique
        expect(titles).toEqual(['Math Homework', 'Physics Setup']);
    });
});

describe('updateSessionPomodoroData', () => {
    test('updates pomodoro_data for a session', () => {
        getOrCreateUser('pom_user');
        const sid = createSession('pom_user', 'g', 'c', 'm', 25, 'Pom');
        updateSessionPomodoroData(sid, { cycle: 1, work: 25, break: 5 });
        const session = db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(sid);
        expect(JSON.parse(session.pomodoro_data)).toEqual({ cycle: 1, work: 25, break: 5 });
    });
});

describe('Friend System', () => {
    beforeEach(() => {
        getOrCreateUser('user_a');
        getOrCreateUser('user_b');
        getOrCreateUser('user_c');
    });

    test('sendFriendRequest sends a request', () => {
        const res = sendFriendRequest('user_a', 'user_b');
        expect(res).toEqual({ success: true, reason: 'sent' });

        const pending = getPendingRequests('user_b');
        expect(pending.length).toBe(1);
        expect(pending[0].sender_id).toBe('user_a');
    });

    test('sendFriendRequest prevents duplicates', () => {
        sendFriendRequest('user_a', 'user_b');
        const res = sendFriendRequest('user_a', 'user_b');
        expect(res).toEqual({ success: false, reason: 'already_sent' });
    });

    test('acceptFriendRequest accepts a pending request', () => {
        sendFriendRequest('user_a', 'user_b');
        const success = acceptFriendRequest('user_a', 'user_b');
        expect(success).toBe(true);

        const listA = getFriends('user_a');
        const listB = getFriends('user_b');
        expect(listA).toEqual(['user_b']);
        expect(listB).toEqual(['user_a']);
    });

    test('sendFriendRequest prevents accepted duplicates', () => {
        sendFriendRequest('user_a', 'user_b');
        acceptFriendRequest('user_a', 'user_b');
        const res = sendFriendRequest('user_a', 'user_b');
        expect(res).toEqual({ success: false, reason: 'already_friends' });
    });

    test('auto-accepts if request sent mutually', () => {
        sendFriendRequest('user_b', 'user_c');
        const res = sendFriendRequest('user_c', 'user_b');
        expect(res).toEqual({ success: true, reason: 'auto_accepted' });
        expect(getFriends('user_c')).toContain('user_b');
    });

    test('canNotifyFriend respects notify_friends setting', () => {
        getOrCreateSettings('user_a');
        expect(canNotifyFriend('user_a')).toBe(false); // default

        db.exec("UPDATE settings SET notify_friends = 1 WHERE user_id = 'user_a'");
        expect(canNotifyFriend('user_a')).toBe(true);
    });

    test('removeFriend removes a friend', () => {
        sendFriendRequest('user_a', 'user_b');
        acceptFriendRequest('user_a', 'user_b');
        expect(removeFriend('user_a', 'user_b')).toBe(true);
        expect(getFriends('user_a')).not.toContain('user_b');
    });
});
