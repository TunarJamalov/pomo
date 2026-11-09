const { initDatabase, db, getOrCreateUser, getOrCreateSettings } = require('../utils/database');
const study = require('../commands/study');
const {
    buildNextStepsRow,
    handleNextStepButton,
    setComebackReminder,
    takeDueComebackReminders,
} = require('../utils/nextSteps');

const OWNER = '330000000000000001';
const OTHER = '330000000000000002';
const REMINDED = '330000000000000003';

const ids = row => row.components.map(c => c.data.custom_id);
const button = (userId, customId) => ({
    user: { id: userId },
    customId,
    locale: 'en-US',
    reply: jest.fn().mockResolvedValue(null),
});

beforeAll(() => initDatabase());
beforeEach(() => {
    [OWNER, OTHER, REMINDED].forEach(id => {
        getOrCreateUser(id);
        getOrCreateSettings(id);
    });
    db.prepare("UPDATE settings SET comeback_reminder = 0, comeback_reminded_at = NULL WHERE user_id LIKE '3300%'").run();
    db.prepare("UPDATE users SET last_session_at = NULL, streak = 0 WHERE discord_id LIKE '3300%'").run();
});

describe('session-complete next steps', () => {
    test('the card offers again, garden and the reminder until it is on', () => {
        const session = { id: 42, user_id: OWNER, duration: 25 };
        expect(ids(buildNextStepsRow(session, 'en'))).toEqual(['next_again_42', 'next_garden', 'next_remind']);
        setComebackReminder(OWNER, true);
        expect(ids(buildNextStepsRow(session, 'en'))).toEqual(['next_again_42', 'next_garden']);
    });

    test('"Again" restarts the same session, only for its owner', async () => {
        const { lastInsertRowid } = db.prepare(`
            INSERT INTO study_sessions (user_id, duration, title, subject, completed) VALUES (?, 40, 'Biology', 'science', 1)
        `).run(OWNER);
        const start = jest.spyOn(study, 'startStudySession').mockResolvedValue(null);

        const stranger = button(OTHER, `next_again_${lastInsertRowid}`);
        await handleNextStepButton(stranger);
        expect(start).not.toHaveBeenCalled();
        expect(stranger.reply.mock.calls[0][0].flags).toBe(64);

        await handleNextStepButton(button(OWNER, `next_again_${lastInsertRowid}`));
        expect(start).toHaveBeenCalledWith(expect.anything(), { minutes: 40, title: 'Biology', subject: 'science' });
        start.mockRestore();
    });

    test('someone who never used Pomo can press the reminder on a public card', async () => {
        const stranger = '330000000000000099';
        db.prepare('DELETE FROM settings WHERE user_id = ?').run(stranger);
        db.prepare('DELETE FROM users WHERE discord_id = ?').run(stranger);

        await expect(handleNextStepButton(button(stranger, 'next_remind'))).resolves.not.toThrow();
        expect(getOrCreateSettings(stranger).comeback_reminder).toBe(1);
    });

    test('the reminder button turns reminders on, the DM button turns them off', async () => {
        await handleNextStepButton(button(OWNER, 'next_remind'));
        expect(getOrCreateSettings(OWNER).comeback_reminder).toBe(1);
        await handleNextStepButton(button(OWNER, 'next_remind_off'));
        expect(getOrCreateSettings(OWNER).comeback_reminder).toBe(0);
    });
});

describe('user-install offer after an Activity timer in DMs', () => {
    const { takeActivityInstallOffer } = require('../utils/nextSteps');
    const started = '2026-11-09 10:00:00';
    const activityStart = (userId, createdAt = '2026-11-09 09:59:40') => db.prepare(`
        INSERT INTO activity_commands (user_id, channel_id, minutes, type, status, created_at)
        VALUES (?, '999', 25, 'study', 'processed', ?)
    `).run(userId, createdAt);

    beforeEach(() => {
        db.prepare("DELETE FROM activity_commands WHERE user_id LIKE '3300%'").run();
        db.prepare("DELETE FROM user_onboarding WHERE user_id LIKE '3300%' AND tip_key = 'activity_install'").run();
    });

    test('the first finished Activity timer that ran in DMs gets the offer, once', () => {
        activityStart(OWNER);
        const session = { user_id: OWNER, guild_id: null, started_at: started };

        const offer = takeActivityInstallOffer(session, 'en', '123');
        expect(offer.line).toContain('Add Pomo to your account');
        expect(offer.button.data.url).toContain('integration_type=1');
        expect(offer.button.data.url).toContain('client_id=123');
        expect(takeActivityInstallOffer(session, 'en', '123')).toBeNull();
    });

    test('no offer in a server with Pomo, or for a DM timer that did not come from the Activity', () => {
        activityStart(OWNER);
        expect(takeActivityInstallOffer({ user_id: OWNER, guild_id: '555', started_at: started }, 'en', '123')).toBeNull();
        // /study from a user install also runs in DMs, but those users already have Pomo on their account
        expect(takeActivityInstallOffer({ user_id: OTHER, guild_id: null, started_at: started }, 'en', '123')).toBeNull();
        // An Activity start from another day doesn't count
        activityStart(REMINDED, '2026-11-08 09:59:40');
        expect(takeActivityInstallOffer({ user_id: REMINDED, guild_id: null, started_at: started }, 'en', '123')).toBeNull();
    });
});

describe('comeback reminder timing', () => {
    const studied = (userId, at, streak = 1) =>
        db.prepare('UPDATE users SET last_session_at = ?, streak = ? WHERE discord_id = ?').run(at, streak, userId);
    const due = now => takeDueComebackReminders(now).map(r => r.userId).filter(id => id.startsWith('3300'));

    test('one DM the next day, at least 20 hours after the last session', () => {
        setComebackReminder(REMINDED, true);
        studied(REMINDED, '2026-10-22 18:00:00', 3);

        expect(due('2026-10-23 10:00:00')).toEqual([]);
        expect(takeDueComebackReminders('2026-10-23 15:00:00').find(r => r.userId === REMINDED)).toMatchObject({ streak: 3 });
        expect(due('2026-10-23 15:15:00')).toEqual([]);
    });

    test('never on the same UTC day as the session, and not once the streak is gone', () => {
        setComebackReminder(REMINDED, true);
        studied(REMINDED, '2026-10-22 00:30:00');
        expect(due('2026-10-22 21:00:00')).toEqual([]);
        expect(due('2026-10-24 12:00:00')).toEqual([]);
        expect(due('2026-10-23 00:15:00')).toEqual([REMINDED]);
    });

    test('a new session arms the next reminder; users who never opted in get none', () => {
        setComebackReminder(REMINDED, true);
        studied(REMINDED, '2026-10-22 18:00:00');
        studied(OTHER, '2026-10-22 18:00:00');
        expect(due('2026-10-23 15:00:00')).toEqual([REMINDED]);

        studied(REMINDED, '2026-10-23 19:00:00', 2);
        expect(due('2026-10-24 16:00:00')).toEqual([REMINDED]);
    });
});
