const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const { getServerPeriodRows } = require('../commands/leaderboard');
const { getWeekWindow } = require('../utils/timezone');

const G = 'lb_period_guild';

beforeAll(() => initDatabase());
beforeEach(() => {
    db.exec(`
        DELETE FROM study_sessions WHERE guild_id IN ('${G}', 'lb_other_guild');
        DELETE FROM voice_sessions WHERE guild_id = '${G}';
        DELETE FROM team_members WHERE session_id IN (SELECT id FROM team_sessions WHERE guild_id = '${G}');
        DELETE FROM team_sessions WHERE guild_id = '${G}';
    `);
    ['lb_solo', 'lb_voice', 'lb_team'].forEach(getOrCreateUser);
});

const now = "datetime('now', '-1 minute')";
function solo(user, minutes, { guild = G, completed = 1, title = 'Focus', when = now } = {}) {
    db.prepare(`INSERT INTO study_sessions (user_id, guild_id, duration, title, started_at, completed) VALUES (?, ?, ?, ?, ${when}, ?)`)
        .run(user, guild, minutes, title, completed);
}

describe('server leaderboard for this week', () => {
    test('adds up solo, team and voice study in this server', () => {
        solo('lb_solo', 25);
        solo('lb_solo', 50);
        solo('lb_voice', 25);
        db.prepare(`INSERT INTO voice_sessions (user_id, guild_id, channel_id, status, credited_minutes, started_at, ended_at)
            VALUES ('lb_voice', ?, 'vc', 'completed', 90, ${now}, ${now})`).run(G);
        const team = db.prepare(`INSERT INTO team_sessions (host_id, guild_id, channel_id, duration, status, started_at)
            VALUES ('lb_team', ?, 'ch', 45, 'completed', ${now})`).run(G).lastInsertRowid;
        db.prepare('INSERT INTO team_members (session_id, user_id) VALUES (?, ?)').run(team, 'lb_team');

        const week = getWeekWindow(new Date(), 'UTC');
        const rows = getServerPeriodRows(G, week.startUtc, week.endUtc);
        expect(rows).toEqual([
            { user_id: 'lb_voice', minutes: 115 },
            { user_id: 'lb_solo', minutes: 75 },
            { user_id: 'lb_team', minutes: 45 },
        ]);
    });

    test('ignores breaks, unfinished sessions, other servers and earlier weeks', () => {
        solo('lb_solo', 5, { title: '__break__' });
        solo('lb_solo', 25, { completed: 0 });
        solo('lb_solo', 25, { guild: 'lb_other_guild' });
        solo('lb_solo', 25, { when: "datetime('now', '-30 days')" });

        const week = getWeekWindow(new Date(), 'UTC');
        expect(getServerPeriodRows(G, week.startUtc, week.endUtc)).toEqual([]);
    });

    test('the menu offers the new scopes', () => {
        const { buildDropdown } = require('../commands/leaderboard');
        const options = buildDropdown('server_week').toJSON().components[0].options;
        expect(options.map(o => o.value)).toEqual(expect.arrayContaining(['server_week', 'server_today']));
        expect(options.find(o => o.default).value).toBe('server_week');
    });
});
