const feedback = require('../commands/feedback');

describe('/feedback command', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        process.env = { ...originalEnv };
        jest.clearAllMocks();
    });

    test('falls back to support server when no feedback channel is configured', async () => {
        delete process.env.FEEDBACK_CHANNEL_ID;
        delete process.env.BUG_REPORT_CHANNEL_ID;
        delete process.env.OWNER_LOG_CHANNEL_ID;
        delete process.env.LOG_CHANNEL_ID;

        const interaction = createInteraction();
        await feedback.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            flags: 64,
            embeds: expect.any(Array),
            components: expect.any(Array),
        }));
    });

    test('sends feedback to the configured channel', async () => {
        process.env.FEEDBACK_CHANNEL_ID = 'feedback_channel';
        const send = jest.fn().mockResolvedValue({});
        const interaction = createInteraction({
            client: {
                channels: {
                    fetch: jest.fn().mockResolvedValue({
                        isTextBased: () => true,
                        send,
                    }),
                },
            },
        });

        await feedback.execute(interaction);

        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
        expect(interaction.client.channels.fetch).toHaveBeenCalledWith('feedback_channel');
        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array),
            allowedMentions: { parse: [] },
        }));
        expect(interaction.editReply).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array),
            components: expect.any(Array),
        }));
    });
});

function createInteraction(overrides = {}) {
    return {
        guildId: 'guild_1',
        guildLocale: 'en',
        locale: 'en',
        guild: { id: 'guild_1', name: 'Study Server' },
        channel: { name: 'bot-commands' },
        user: { id: 'user_1', tag: 'Tester#0001' },
        options: {
            getString: jest.fn(name => {
                if (name === 'type') return 'suggestion';
                if (name === 'message') return 'Please add more onboarding tips.';
                return null;
            }),
            getBoolean: jest.fn(name => (name === 'contact' ? true : null)),
        },
        client: {
            channels: {
                fetch: jest.fn(),
            },
        },
        reply: jest.fn().mockResolvedValue({}),
        deferReply: jest.fn().mockResolvedValue({}),
        editReply: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
}
