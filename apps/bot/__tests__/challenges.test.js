const { initDatabase, db, getOrCreateUser, createChallenge, joinChallenge } = require('../utils/database');
const { recordChallengeFocus, recordGoalCompleted } = require('../utils/challenges');

beforeAll(() => initDatabase());
beforeEach(() => db.exec('DELETE FROM challenge_members; DELETE FROM challenges; DELETE FROM todos;'));

const GUILD = 'challenge_guild';
const FUTURE = '2099-01-01T00:00:00.000Z';

function challenge(type, target, users = ['ch_user']) {
    users.forEach(u => getOrCreateUser(u));
    const id = Number(createChallenge(users[0], GUILD, `${type} test`, type, target, FUTURE).lastInsertRowid);
    users.forEach(u => joinChallenge(id, u));
    return id;
}
const progress = (id, user = 'ch_user') =>
    db.prepare('SELECT progress, completed_at FROM challenge_members WHERE challenge_id = ? AND user_id = ?').get(id, user);
const day = d => new Date(`2026-10-${String(d).padStart(2, '0')}T12:00:00Z`);

describe('challenge progress for every type', () => {
    test('time and sessions keep working', () => {
        const time = challenge('time', 60);
        const sessions = challenge('sessions', 2);
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25 });
        expect(progress(time).progress).toBe(25);
        expect(progress(sessions).progress).toBe(1);
    });

    test('streak counts consecutive study days and keeps the best run', () => {
        const id = challenge('streak', 3);
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(1) });
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(1) }); // same day: no change
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(2) });
        expect(progress(id).progress).toBe(2);
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(5) }); // gap resets the run
        expect(progress(id).progress).toBe(2);
        recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(6) });
        const news = recordChallengeFocus({ userId: 'ch_user', guildId: GUILD, minutes: 25, now: day(7) });
        expect(progress(id).progress).toBe(3);
        expect(progress(id).completed_at).not.toBeNull();
        expect(news[0]).toContain('completed the challenge');
    });

    test('team adds everyone\'s minutes to one target and announces once', () => {
        const id = challenge('team', 50, ['team_a', 'team_b']);
        expect(recordChallengeFocus({ userId: 'team_a', guildId: GUILD, minutes: 30 })).toEqual([]);
        const news = recordChallengeFocus({ userId: 'team_b', guildId: GUILD, minutes: 25 });
        expect(news).toHaveLength(1);
        expect(news[0]).toContain('Team challenge');
        expect(recordChallengeFocus({ userId: 'team_a', guildId: GUILD, minutes: 10 })).toEqual([]);
        expect(db.prepare('SELECT completed_at FROM challenges WHERE id = ?').get(id).completed_at).not.toBeNull();
    });

    test('goal counts to-dos completed after joining, including from the website', () => {
        const id = challenge('goal', 2);
        db.prepare("INSERT INTO todos (user_id, content, completed, completed_at) VALUES ('ch_user', 'old', 1, '2000-01-01 00:00:00')").run();
        db.prepare("INSERT INTO todos (user_id, content, completed, completed_at) VALUES ('ch_user', 'read', 1, datetime('now', '+1 minute'))").run();
        expect(recordGoalCompleted('ch_user')).toEqual([]);
        expect(progress(id).progress).toBe(1);
        db.prepare("INSERT INTO todos (user_id, content, completed, completed_at) VALUES ('ch_user', 'write', 1, datetime('now', '+2 minutes'))").run();
        const news = recordGoalCompleted('ch_user');
        expect(progress(id).progress).toBe(2);
        expect(news).toHaveLength(1);
        expect(recordGoalCompleted('ch_user')).toEqual([]);
    });

    test('other servers and DMs do not count', () => {
        const id = challenge('time', 60);
        recordChallengeFocus({ userId: 'ch_user', guildId: 'other_guild', minutes: 25 });
        recordChallengeFocus({ userId: 'ch_user', guildId: null, minutes: 25 });
        expect(progress(id).progress).toBe(0);
    });
});
