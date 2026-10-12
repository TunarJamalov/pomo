/**
 * Tests for commands/study.js — /study command logic.
 * Discord.js objects (interaction, client) are mocked.
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
            addIntegerOption: jest.fn().mockReturnThis(),
            addStringOption: jest.fn().mockReturnThis(),
        })),
        ActionRowBuilder: jest.fn().mockImplementation(() => ({
            addComponents: jest.fn().mockReturnThis(),
        })),
        ButtonBuilder: jest.fn().mockImplementation(() => ({
            setCustomId: jest.fn().mockReturnThis(),
            setLabel: jest.fn().mockReturnThis(),
            setStyle: jest.fn().mockReturnThis(),
            setEmoji: jest.fn().mockReturnThis(),
            setURL: jest.fn().mockReturnThis(),
        })),
        ButtonStyle: { Danger: 4, Link: 5 },
        ApplicationIntegrationType: { GuildInstall: 0, UserInstall: 1 },
        InteractionContextType: { Guild: 0, BotDM: 1, PrivateChannel: 2 },
        EmbedBuilder: jest.fn(() => mockEmbed),
    };
});

jest.mock('../../utils/database', () => ({
    getOrCreateUser: jest.fn(() => ({ discord_id: 'user_123', water: 0, level: 1 })),
    isUserInAnyActiveSession: jest.fn(() => false),
    createSession: jest.fn(() => 42),
    sessionRepository: { createSession: jest.fn(() => 42), updateMessageId: jest.fn(), cancelSession: jest.fn() },
    transactionManager: { execute: jest.fn(async (cb) => cb({})) },
    getActiveTodoByPosition: jest.fn(() => null),
    getActiveSessionForUser: jest.fn(() => ({
        id: 42,
        user_id: 'user_123',
        guild_id: 'guild_1',
        channel_id: 'channel_1',
        message_id: 'msg_1',
        duration: 25,
        title: 'Study Session',
        started_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
        completed: 0,
        reminder_sent: 0,
    })),
    db: {
        prepare: jest.fn(() => ({
            run: jest.fn(),
            get: jest.fn(),
            all: jest.fn()
        }))
    }
}));

jest.mock('../../utils/timerManager', () => ({
    hasActiveSession: jest.fn(() => false),
    startStudyTimer: jest.fn(),
    buildStudyControlRow: jest.fn(() => ({ components: [] })),
}));

jest.mock('../../utils/embeds', () => ({
    errorEmbed: jest.fn((title, desc) => ({ title, desc })),
    progressBar: jest.fn(() => '▓▓▓▓▓▓░░░░ 50%'),
    formatTime: jest.fn((m) => `${m}m`),
}));

jest.mock('../../utils/constants', () => ({
    Colors: { STUDY: 0xe07c24 },
}));

const studyCommand = require('../../commands/study');
const { startStudyTimer } = require('../../utils/timerManager');
const { createSession, getOrCreateUser, isUserInAnyActiveSession, getActiveTodoByPosition, sessionRepository } = require('../../utils/database');

function buildInteraction(overrides = {}) {
    return {
        user: { id: 'user_123', username: 'TestUser' },
        guildId: 'guild_1',
        channelId: 'channel_1',
        client: {},
        options: {
            getInteger: jest.fn((name) => name === 'minutes' ? 25 : null),
            getString: jest.fn(() => null),
        },
        reply: jest.fn().mockResolvedValue({ id: 'msg_1' }),
        ...overrides,
    };
}

// ── Tests ──────────────────────────────────────────────────────

describe('/study command', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        isUserInAnyActiveSession.mockReturnValue(false);
        getActiveTodoByPosition.mockReturnValue(null);
    });

    test('creates a session and starts timer on first call', async () => {
        const interaction = buildInteraction();
        await studyCommand.execute(interaction);

        expect(getOrCreateUser).toHaveBeenCalledWith('user_123');
        expect(sessionRepository.createSession).toHaveBeenCalled();
        expect(startStudyTimer).toHaveBeenCalled();
        expect(interaction.reply).toHaveBeenCalled();
    });

    test('replies with error embed when user already has active session', async () => {
        isUserInAnyActiveSession.mockReturnValue(true);
        const interaction = buildInteraction();

        await studyCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(
            expect.objectContaining({ flags: 64 })
        );
        expect(startStudyTimer).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
    });

    test('uses default title "Study Session" when no title provided', async () => {
        const interaction = buildInteraction();
        interaction.options.getString.mockReturnValue(null);
        await studyCommand.execute(interaction);

        // createSession should be called with 'Study Session' as the title
        expect(sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), { userId: 'user_123', guildId: 'guild_1', channelId: 'channel_1', duration: 25, title: 'Study Session', todoId: null, subject: 'general' });
    });

    test('uses custom title when provided', async () => {
        const interaction = buildInteraction();
        interaction.options.getString.mockImplementation((name) => name === 'title' ? 'Math Homework' : null);
        await studyCommand.execute(interaction);

        expect(sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), { userId: 'user_123', guildId: 'guild_1', channelId: 'channel_1', duration: 25, title: 'Math Homework', todoId: null, subject: 'general' });
    });

    test('uses selected subject when provided', async () => {
        const interaction = buildInteraction();
        interaction.options.getString.mockImplementation((name) => name === 'subject' ? 'math' : null);
        await studyCommand.execute(interaction);

        expect(sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), { userId: 'user_123', guildId: 'guild_1', channelId: 'channel_1', duration: 25, title: 'Study Session', todoId: null, subject: 'math' });
    });

    test('links a todo task when task number is provided', async () => {
        getActiveTodoByPosition.mockReturnValueOnce({ id: 7, content: 'Read chapter 4' });
        const interaction = buildInteraction({
            options: {
                getInteger: jest.fn((name) => name === 'minutes' ? 25 : 1),
                getString: jest.fn(() => null),
            },
        });

        await studyCommand.execute(interaction);

        expect(getActiveTodoByPosition).toHaveBeenCalledWith('user_123', 1);
        expect(sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), { userId: 'user_123', guildId: 'guild_1', channelId: 'channel_1', duration: 25, title: 'Read chapter 4', todoId: 7, subject: 'general' });
    });

    test('module exports "data" and "execute"', () => {
        expect(studyCommand).toHaveProperty('data');
        expect(studyCommand).toHaveProperty('execute');
        expect(typeof studyCommand.execute).toBe('function');
    });
});

describe('/study from a user install (bot not in the server)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        sessionRepository.createSession.mockReturnValue({ id: 42, user_id: 'user_123', duration: 25 });
        isUserInAnyActiveSession.mockReturnValue(false);
        getActiveTodoByPosition.mockReturnValue(null);
    });

    function buildForeignInteraction(dmSend) {
        return buildInteraction({
            guildId: 'foreign_guild',
            guild: null,
            client: { user: { id: 'bot_1' } },
            deferReply: jest.fn().mockResolvedValue({}),
            editReply: jest.fn().mockResolvedValue({}),
            user: {
                id: 'user_123',
                username: 'TestUser',
                createDM: jest.fn().mockResolvedValue({ id: 'dm_1', send: dmSend }),
            },
        });
    }

    test('runs the live timer in DMs and posts a notice in the channel', async () => {
        const dmSend = jest.fn().mockResolvedValue({ id: 'dm_msg_1', url: 'https://discord.com/channels/@me/dm_1/dm_msg_1' });
        const interaction = buildForeignInteraction(dmSend);

        await studyCommand.execute(interaction);

        expect(sessionRepository.createSession).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            guildId: null,
            channelId: 'dm_1',
        }));
        expect(dmSend).toHaveBeenCalled();
        expect(sessionRepository.updateMessageId).toHaveBeenCalledWith(expect.anything(), 42, 'dm_msg_1');
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.any(String) }));
        expect(startStudyTimer).toHaveBeenCalled();
    });

    test('cancels the session when the user blocks DMs', async () => {
        const dmSend = jest.fn().mockRejectedValue(new Error('Cannot send messages to this user'));
        const interaction = buildForeignInteraction(dmSend);

        await studyCommand.execute(interaction);

        expect(sessionRepository.cancelSession).toHaveBeenCalledWith(expect.anything(), 42);
        expect(startStudyTimer).not.toHaveBeenCalled();
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
    });
});
