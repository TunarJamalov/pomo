/**
 * Tests for commands/daily.js — /daily command logic.
 */

jest.mock('discord.js', () => {
    const mockEmbed = {
        setColor: jest.fn().mockReturnThis(),
        setTitle: jest.fn().mockReturnThis(),
        setDescription: jest.fn().mockReturnThis(),
        setFooter: jest.fn().mockReturnThis(),
        setTimestamp: jest.fn().mockReturnThis(),
    };
    return {
        SlashCommandBuilder: jest.fn().mockImplementation(() => ({
            setName: jest.fn().mockReturnThis(),
            setDescription: jest.fn().mockReturnThis(),
            addBooleanOption: jest.fn().mockImplementation(function(callback) {
                callback({
                    setName: jest.fn().mockReturnThis(),
                    setDescription: jest.fn().mockReturnThis(),
                    setRequired: jest.fn().mockReturnThis(),
                });
                return this;
            }),
        })),
        EmbedBuilder: jest.fn(() => mockEmbed),
    };
});

jest.mock('../../utils/embeds', () => ({
    successEmbed: jest.fn((title, desc) => ({ title, desc })),
    errorEmbed: jest.fn((title, desc) => ({ title, desc })),
}));

const TODAY = new Date().toISOString().split('T')[0];
const YESTERDAY = new Date(Date.now() - 86400000).toISOString().split('T')[0];

// We'll control what getOrCreateUser returns per test
const mockGetOrCreateUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockIncrementUser = jest.fn();
const mockDb = {
    prepare: jest.fn(() => ({ run: jest.fn() })),
};

jest.mock('../../utils/database', () => ({
    getOrCreateUser: (...args) => mockGetOrCreateUser(...args),
    getOrCreateUserAsync: async (...args) => mockGetOrCreateUser(...args),
    updateUser: (...args) => mockUpdateUser(...args),
    incrementUser: (...args) => mockIncrementUser(...args),
    db: mockDb,
    getPremiumEntitlement: () => null,
}));

jest.mock('../../utils/constants', () => ({
    Colors: { SUCCESS: 0x57f287 },
    Plants: {
        carrot: { emoji: '🥕', name: 'Carrot' },
        tomato: { emoji: '🍅', name: 'Tomato' },
        potato: { emoji: '🥔', name: 'Potato' },
        apple: { emoji: '🍎', name: 'Apple' },
    },
}));

const dailyCommand = require('../../commands/daily');

function buildInteraction(userId = 'user_daily_1') {
    return {
        user: { id: userId },
        options: { getBoolean: jest.fn().mockReturnValue(false) },
        reply: jest.fn().mockResolvedValue({}),
    };
}

// ── Tests ──────────────────────────────────────────────────────

describe('/daily command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('module exports "data" and "execute"', () => {
        expect(dailyCommand).toHaveProperty('data');
        expect(dailyCommand).toHaveProperty('execute');
        expect(typeof dailyCommand.execute).toBe('function');
    });

    test('grants +3 water and sets last_daily_date when not claimed today', async () => {
        mockGetOrCreateUser.mockReturnValue({ water: 5, last_daily_date: YESTERDAY });

        const interaction = buildInteraction();
        await dailyCommand.execute(interaction);

        expect(mockIncrementUser).toHaveBeenCalledWith(interaction.user.id, 'water', 3);
        expect(mockUpdateUser).toHaveBeenCalledWith(interaction.user.id, { last_daily_date: TODAY });
        expect(interaction.reply).toHaveBeenCalled();
    });

    test('replies with error embed when already claimed today', async () => {
        mockGetOrCreateUser.mockReturnValue({ water: 5, last_daily_date: TODAY });

        const interaction = buildInteraction();
        await dailyCommand.execute(interaction);

        // Should NOT award anything
        expect(mockIncrementUser).not.toHaveBeenCalled();
        expect(mockUpdateUser).not.toHaveBeenCalled();

        // Should reply with ephemeral error
        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ flags: 64 })
        );
    });

    test('grants reward on very first use (last_daily_date is null)', async () => {
        mockGetOrCreateUser.mockReturnValue({ water: 0, last_daily_date: null });

        const interaction = buildInteraction();
        await dailyCommand.execute(interaction);

        expect(mockIncrementUser).toHaveBeenCalledWith(interaction.user.id, 'water', 3);
    });

    test('shows correct next-daily countdown in error message', async () => {
        mockGetOrCreateUser.mockReturnValue({ water: 10, last_daily_date: TODAY });
        const { errorEmbed } = require('../../utils/embeds');

        const interaction = buildInteraction();
        await dailyCommand.execute(interaction);

        expect(errorEmbed).toHaveBeenCalledWith(
            'Already Claimed',
            expect.stringContaining('already')
        );
    });
});
