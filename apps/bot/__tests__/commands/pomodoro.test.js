const pomodoroCommand = require('../../commands/pomodoro');
const { getActiveSessionForUser, getPastSessionTitles } = require('../../utils/database');
const { isUserInAnyActiveSession } = require('../../utils/database');

// Mock dependencies
jest.mock('../../utils/database', () => ({
    getOrCreateUser: jest.fn(),
    createSession: jest.fn().mockReturnValue(123),
    sessionRepository: { createSession: jest.fn(() => ({id: 123})), updatePomodoroData: jest.fn() },
    transactionManager: { execute: jest.fn(async (cb) => cb({})) },
    updateSessionPomodoroData: jest.fn(),
    getActiveSessionForUser: jest.fn().mockReturnValue({ id: 123 }),
    getPastSessionTitles: jest.fn(),
    isUserInAnyActiveSession: jest.fn(),
    db: {
        prepare: jest.fn(() => ({
            run: jest.fn(),
            get: jest.fn(),
            all: jest.fn()
        }))
    }
}));

jest.mock('../../utils/timerManager', () => ({
    startStudyTimer: jest.fn(),
    hasActiveSession: jest.fn(),
    isTrialEligible: jest.fn(() => false),
    buildTrialButton: jest.fn(),
}));

describe('/pomodoro command', () => {
    let interaction;

    beforeEach(() => {
        jest.clearAllMocks();

        interaction = {
            commandName: 'pomodoro',
            user: { id: 'user_pomo_1', username: 'PomoTester' },
            guildId: 'guild_1',
            channelId: 'channel_1',
            options: {
                getInteger: jest.fn((opt) => {
                    if (opt === 'work') return 25;
                    if (opt === 'break') return 10;
                    if (opt === 'cycles') return 2;
                    return null;
                }),
                getString: jest.fn(() => 'Test Pomo'),
                getFocused: jest.fn(() => 'Test'),
            },
            reply: jest.fn().mockResolvedValue({ id: 'msg_1' }),
            respond: jest.fn().mockResolvedValue(),
            client: {}
        };
    });

    test('replies with error if user has active session', async () => {
        isUserInAnyActiveSession.mockReturnValueOnce(true);

        await pomodoroCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ flags: 64 })
        );
        expect(interaction.reply.mock.calls[0][0].embeds[0].data.title).toBe('❌ Active Session');
    });

    test('creates session and starts timer with correct pomodoro data', async () => {
        isUserInAnyActiveSession.mockReturnValueOnce(false);

        await pomodoroCommand.execute(interaction);

        // Verify session creation
        expect(require('../../utils/database').sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), { userId: 'user_pomo_1', guildId: 'guild_1', channelId: 'channel_1', duration: 25, title: 'Test Pomo' });

        // Verify pomodoro data assignment
        expect(require('../../utils/database').sessionRepository.updatePomodoroData).toHaveBeenCalledWith(expect.anything(), 123, { cycle: 1, maxCycles: 2, work: 25, break: 10, originalTitle: 'Test Pomo', type: 'work' });

        // Verify timer started
        expect(require('../../utils/timerManager').startStudyTimer).toHaveBeenCalledWith(
            interaction.client,
            expect.objectContaining({ id: 123, pomodoro_data: expect.any(String) }),
            true
        );
    });

    test('autocomplete returns matching titles', async () => {
        getPastSessionTitles.mockReturnValue(['Test Pomo', 'Other Pomo', 'Test Session']);
        
        await pomodoroCommand.autocomplete(interaction);

        expect(getPastSessionTitles).toHaveBeenCalledWith('user_pomo_1');
        expect(interaction.respond).toHaveBeenCalledWith(
            expect.arrayContaining([
                { name: 'Test Pomo', value: 'Test Pomo' },
                { name: 'Test Session', value: 'Test Session' }
            ])
        );
    });
});
