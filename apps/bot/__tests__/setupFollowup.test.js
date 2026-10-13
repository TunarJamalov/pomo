const {
    initDatabase, db, recordGuildJoin, getOrCreateUser,
    getSetupFollowupCandidates, getSetupNudgeCandidates, getSetupReminderCandidates,
} = require('../utils/database');
const { runSetupFollowups } = require('../utils/setupReminder');

beforeAll(() => initDatabase());
beforeEach(() => db.exec("DELETE FROM guild_installations WHERE guild_id LIKE 'fu_%'; DELETE FROM guild_settings WHERE guild_id LIKE 'fu_%'; DELETE FROM study_sessions WHERE guild_id LIKE 'fu_%'"));

function joined(id, hoursAgo, { baseline = 0 } = {}) {
    recordGuildJoin({ id, name: id, memberCount: 30, ownerId: 'owner' });
    db.prepare(`UPDATE guild_installations SET joined_at = datetime('now', ?), is_baseline = ? WHERE guild_id = ?`)
        .run(`-${hoursAgo} hours`, baseline, id);
}
const followupIds = () => getSetupFollowupCandidates().map(c => c.guild_id);

describe('day-1 setup follow-up', () => {
    test('only servers 20-72 hours old with nothing turned on', () => {
        joined('fu_day1', 30);
        joined('fu_fresh', 5);
        joined('fu_old', 100);
        joined('fu_baseline', 30, { baseline: 1 });
        joined('fu_configured', 30);
        db.prepare("INSERT INTO guild_settings (guild_id, report_enabled) VALUES ('fu_configured', 1) ON CONFLICT(guild_id) DO UPDATE SET report_enabled = 1").run();

        expect(followupIds()).toEqual(['fu_day1']);
    });

    test('is posted once with the setup buttons', async () => {
        joined('fu_day1', 30);
        const send = jest.fn().mockResolvedValue({ id: 'msg' });
        const channel = { isTextBased: () => true, isDMBased: () => false, permissionsFor: () => ({ has: () => true }), send };
        const guild = { id: 'fu_day1', preferredLocale: 'az', systemChannel: channel, channels: { cache: new Map() }, members: { me: {} } };
        const client = { guilds: { cache: new Map([['fu_day1', guild]]), fetch: jest.fn() } };

        expect(await runSetupFollowups(client)).toEqual({ candidates: 1, sent: 1 });
        const payload = send.mock.calls[0][0];
        expect(payload.embeds[0].toJSON().title).toContain('Pomo');
        expect(payload.components[0].toJSON().components[0].custom_id).toBe('setup_quick');
        expect(followupIds()).toEqual([]);
    });
});

describe('earlier setup reminders', () => {
    test('one completed session is enough for the activity nudge', () => {
        joined('fu_active', 48);
        getOrCreateUser('fu_user');
        db.prepare("INSERT INTO study_sessions (user_id, guild_id, duration, title, started_at, completed) VALUES ('fu_user', 'fu_active', 25, 'Focus', datetime('now'), 1)").run();
        expect(getSetupNudgeCandidates(200).map(c => c.guild_id)).toContain('fu_active');
    });

    test('quiet servers get the reminder after 7 days instead of 14', () => {
        joined('fu_quiet', 8 * 24);
        expect(getSetupReminderCandidates(200).map(c => c.guild_id)).toContain('fu_quiet');
    });
});
