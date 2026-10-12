const path = require('path');
const fs = require('fs');
const os = require('os');

const TEST_DB_PATH = path.join(os.tmpdir(), `pomodoro_user_onboarding_${Date.now()}.db`);
process.env.POMODORO_DB_PATH = TEST_DB_PATH;

const {
    db,
    initDatabase,
    getSeenOnboardingTips,
    hasSeenOnboardingTip,
} = require('../utils/database');
const {
    ONBOARDING_TIPS,
    maybeSendUserOnboardingTip,
} = require('../utils/userOnboarding');

beforeAll(() => initDatabase());

afterAll(() => {
    try {
        db.close();
        if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    } catch (_) {}
    delete process.env.POMODORO_DB_PATH;
});

beforeEach(() => {
    db.exec(`
        DELETE FROM user_onboarding;
        DELETE FROM users;
    `);
});

function createInteraction(commandName, userId = 'onboarding_user') {
    return {
        commandName,
        user: { id: userId, bot: false },
        locale: 'en',
        replied: true,
        deferred: false,
        isChatInputCommand: jest.fn(() => true),
        followUp: jest.fn().mockResolvedValue({ id: 'tip' }),
        reply: jest.fn().mockResolvedValue({ id: 'tip' }),
    };
}

describe('user onboarding tips', () => {
    test('defines tips for commands that introduce core loops', () => {
        expect(Object.keys(ONBOARDING_TIPS)).toEqual(expect.arrayContaining([
            'study',
            'garden',
            'daily',
            'profile',
        ]));
    });

    test('sends a command tip only once per user', async () => {
        const interaction = createInteraction('study');

        expect(await maybeSendUserOnboardingTip(interaction)).toBe(true);
        expect(await maybeSendUserOnboardingTip(createInteraction('study'))).toBe(false);

        expect(interaction.followUp).toHaveBeenCalledTimes(1);
        expect(interaction.followUp.mock.calls[0][0].flags).toBe(64);
        expect(hasSeenOnboardingTip('onboarding_user', 'command:study')).toBe(true);
        expect(getSeenOnboardingTips('onboarding_user').map(row => row.tip_key)).toEqual(['command:study']);
    });

    test('ignores commands without an onboarding tip', async () => {
        const interaction = createInteraction('serverstats');

        expect(await maybeSendUserOnboardingTip(interaction)).toBe(false);
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    test('uses reply when the original command has not replied yet', async () => {
        const interaction = createInteraction('garden');
        interaction.replied = false;

        expect(await maybeSendUserOnboardingTip(interaction)).toBe(true);
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    test('localizes onboarding tips from the interaction language', async () => {
        const interaction = createInteraction('study', 'french_user');
        interaction.locale = 'fr';

        expect(await maybeSendUserOnboardingTip(interaction)).toBe(true);
        expect(interaction.followUp.mock.calls[0][0].embeds[0].data.title)
            .toBe('Prochaine étape : fais pousser ton jardin');
    });
});
