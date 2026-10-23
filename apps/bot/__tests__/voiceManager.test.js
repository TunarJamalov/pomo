const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_voice_test_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getOrCreateGuildSettings,
    updateGuildSettings,
    createVoiceSession,
    getOrCreateUser,
    createSession,
} = require('../utils/database');
const {
    finishVoiceSession,
    getOverlappingTimerMinutes,
    reportStudyRoomFailure,
} = require('../utils/voiceManager');

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
        DELETE FROM user_achievements;
        DELETE FROM user_pets;
        DELETE FROM inventory;
        DELETE FROM guild_quest_claims;
        DELETE FROM guild_quest_contributions;
        DELETE FROM guild_quests;
        DELETE FROM activity_rewards;
        DELETE FROM user_onboarding;
        DELETE FROM settings;
        DELETE FROM voice_sessions;
        DELETE FROM study_sessions;
        DELETE FROM guild_settings;
        DELETE FROM users;
    `);

    getOrCreateGuildSettings('guild_voice');
    updateGuildSettings('guild_voice', {
        guild_name: 'Voice Test Guild',
        voice_tracking_enabled: 1,
        voice_target_id: 'voice_channel',
        voice_target_type: 'channel',
        voice_rewards_enabled: 1,
        voice_min_minutes: 10,
        voice_daily_reward_cap: 240,
    });
});

function createBackdatedVoiceSession(userId, startedAt) {
    const session = createVoiceSession(userId, 'guild_voice', 'voice_channel');
    db.prepare(`
        UPDATE voice_sessions
        SET started_at = ?, last_seen_at = ?
        WHERE id = ?
    `).run(startedAt, startedAt, session.id);
    return session;
}

describe('voice focus tracking', () => {
    test('discards sessions below the configured minimum', async () => {
        createBackdatedVoiceSession('voice_short', '2026-06-06 10:00:00');

        const result = await finishVoiceSession({}, 'voice_short', 'guild_voice', {
            endedAt: '2026-06-06 10:09:00',
            notify: false,
        });

        const stored = db.prepare('SELECT * FROM voice_sessions WHERE user_id = ?').get('voice_short');
        const user = getOrCreateUser('voice_short');

        expect(result.discarded).toBe(true);
        expect(stored.status).toBe('discarded');
        expect(stored.credited_minutes).toBe(0);
        expect(user.total_focus_minutes).toBe(0);
        expect(user.water).toBe(0);
    });

    test('awards only complete 25-minute reward blocks', async () => {
        createBackdatedVoiceSession('voice_reward', '2026-06-06 10:00:00');

        const result = await finishVoiceSession({}, 'voice_reward', 'guild_voice', {
            endedAt: '2026-06-06 10:50:00',
            notify: false,
        });

        const user = getOrCreateUser('voice_reward');
        const stored = db.prepare('SELECT * FROM voice_sessions WHERE user_id = ?').get('voice_reward');

        expect(result.creditedMinutes).toBe(50);
        expect(result.rewardedMinutes).toBe(50);
        expect(result.water).toBe(2);
        expect(result.xp).toBe(20);
        expect(stored.status).toBe('completed');
        expect(user.total_focus_minutes).toBe(50);
        expect(user.total_sessions).toBe(1);
        expect(user.water).toBe(2);
        expect(user.xp).toBe(20);
    });

    describe('summary DMs (/voice dms)', () => {
        function fakeClient() {
            const send = jest.fn().mockResolvedValue({});
            const client = {
                users: {
                    fetch: jest.fn().mockResolvedValue({ send }),
                    createDM: jest.fn().mockResolvedValue({ send }),
                },
            };
            return { client, send };
        }

        test('members get a summary DM by default', async () => {
            createBackdatedVoiceSession('voice_dm_on', '2026-06-06 10:00:00');
            const { client, send } = fakeClient();

            await finishVoiceSession(client, 'voice_dm_on', 'guild_voice', { endedAt: '2026-06-06 10:50:00' });

            expect(send).toHaveBeenCalled();
        });

        test('the summary shows the streak, explains water once, and offers next steps', async () => {
            createBackdatedVoiceSession('voice_dm_new', '2026-06-06 10:00:00');
            const first = fakeClient();
            await finishVoiceSession(first.client, 'voice_dm_new', 'guild_voice', { endedAt: '2026-06-06 10:50:00' });

            const summary = first.send.mock.calls[0][0];
            expect(summary.embeds[0].data.description).toContain('-day streak');
            expect(summary.embeds[0].data.description).toContain('New to Pomo');
            expect(summary.components[0].components.map(c => c.data.custom_id)).toEqual(['next_garden', 'next_remind']);

            createBackdatedVoiceSession('voice_dm_new', '2026-06-07 10:00:00');
            const second = fakeClient();
            await finishVoiceSession(second.client, 'voice_dm_new', 'guild_voice', { endedAt: '2026-06-07 10:50:00' });
            expect(second.send.mock.calls[0][0].embeds[0].data.description).not.toContain('New to Pomo');
        });

        test('no DMs at all when the server turned them off, but the time still counts', async () => {
            updateGuildSettings('guild_voice', { voice_summary_dm: 0 });
            createBackdatedVoiceSession('voice_dm_off', '2026-06-06 10:00:00');
            const { client, send } = fakeClient();

            const result = await finishVoiceSession(client, 'voice_dm_off', 'guild_voice', { endedAt: '2026-06-06 10:50:00' });

            expect(send).not.toHaveBeenCalled();
            expect(client.users.createDM).not.toHaveBeenCalled();
            expect(result.creditedMinutes).toBe(50);
            expect(getOrCreateUser('voice_dm_off').water).toBe(2);
        });
    });

    test('subtracts overlapping solo timer minutes to prevent double rewards', async () => {
        getOrCreateUser('voice_overlap');
        const studyId = createSession(
            'voice_overlap',
            'guild_voice',
            'text_channel',
            'message',
            25,
            'Overlapping Study',
        );
        db.prepare(`
            UPDATE study_sessions
            SET started_at = '2026-06-06 10:10:00',
                ends_at = '2026-06-06 10:35:00',
                completed = 1
            WHERE id = ?
        `).run(studyId);

        expect(getOverlappingTimerMinutes(
            'voice_overlap',
            '2026-06-06 10:00:00',
            '2026-06-06 11:00:00',
        )).toBe(25);

        createBackdatedVoiceSession('voice_overlap', '2026-06-06 10:00:00');
        const result = await finishVoiceSession({}, 'voice_overlap', 'guild_voice', {
            endedAt: '2026-06-06 11:00:00',
            notify: false,
        });

        expect(result.totalMinutes).toBe(60);
        expect(result.overlapMinutes).toBe(25);
        expect(result.creditedMinutes).toBe(35);
        expect(result.rewardedMinutes).toBe(25);
        expect(result.water).toBe(1);
        expect(result.xp).toBe(10);
    });
});

describe('study room permission failures', () => {
    test('DM the member once per hour and log once per guild instead of on every join', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const guild = { id: 'perm_guild', name: 'Study Hall' };
        const member = { id: 'perm_member', send: jest.fn().mockResolvedValue({}) };
        const err = Object.assign(new Error('Missing Permissions'), { code: 50013 });

        await reportStudyRoomFailure(guild, member, err);
        await reportStudyRoomFailure(guild, member, err);
        await reportStudyRoomFailure(guild, member, err);

        expect(member.send).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });

    test('other errors are logged but do not DM the member', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const member = { id: 'other_member', send: jest.fn() };

        await reportStudyRoomFailure({ id: 'other_guild', name: 'X' }, member, new Error('Unknown Channel'));

        expect(member.send).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledTimes(1);
        warn.mockRestore();
    });
});
