jest.mock('../../utils/database', () => ({
    getGuildProgress: jest.fn(() => ({
        guild_id: 'guild_1',
        guild_name: 'Study Club',
        level: 2,
        xp: 125,
        total_focus_minutes: 125,
        total_sessions: 5,
        season_xp: 125,
    })),
    getGuildXpToNextLevel: jest.fn(() => ({ current: 25, required: 200, remaining: 175 })),
    getCurrentGuildQuests: jest.fn(() => []),
    claimGuildQuestReward: jest.fn(),
    SERVER_QUEST_DEFINITIONS: [
        { key: 'focus_minutes', title: 'Focus Together' },
        { key: 'sessions', title: 'Keep The Rhythm' },
        { key: 'contributors', title: 'Bring The Study Room To Life' },
    ],
    getOrCreateUser: jest.fn(() => ({ xp: 0, level: 1 })),
    updateUser: jest.fn(),
}));

jest.mock('../../utils/embeds', () => ({
    formatTime: jest.fn(minutes => `${minutes}m`),
}));

const serverCommand = require('../../commands/server');

describe('/server progress', () => {
    test('exports a progress subcommand', () => {
        const json = serverCommand.data.toJSON();
        expect(json.name).toBe('server');
        expect(json.options[0].name).toBe('progress');
    });

    test('replies with server progression data', async () => {
        const interaction = {
            guildId: 'guild_1',
            guild: { name: 'Fallback Name' },
            options: { getSubcommand: () => 'progress' },
            reply: jest.fn().mockResolvedValue({}),
        };

        await serverCommand.execute(interaction);

        const payload = interaction.reply.mock.calls[0][0];
        expect(payload.embeds).toHaveLength(1);
        expect(payload.embeds[0].data.title).toContain('Study Club');
        expect(payload.embeds[0].data.fields).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Server Level', value: '**2**' }),
            expect.objectContaining({ name: 'Server XP', value: '**125**' }),
        ]));
    });
});
