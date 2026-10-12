const guide = require('../commands/guide');

describe('/guide onboarding panel', () => {
    test('builds a public onboarding panel with three action rows', () => {
        const embed = guide.buildGuidePanelEmbed('en').toJSON();
        const rows = guide.buildGuidePanelRows('en', { application: { id: '123456789' } });

        expect(embed.title).toBe('Start Studying with PomoBot');
        expect(rows).toHaveLength(3);
        expect(rows[0].components).toHaveLength(4);
        expect(rows[1].components).toHaveLength(2);
        expect(rows[2].components).toHaveLength(3);
        expect(rows[2].components[0].data.url).toContain('client_id=123456789');
    });

    test('requires Manage Server permission to post the public panel', async () => {
        const interaction = createInteraction({
            memberPermissions: { has: jest.fn().mockReturnValue(false) },
        });

        await guide.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            flags: 64,
            content: expect.any(String),
        }));
    });

    test('posts the panel publicly for server managers', async () => {
        const interaction = createInteraction();

        await guide.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array),
            components: expect.any(Array),
        }));
        expect(interaction.reply.mock.calls[0][0].flags).toBeUndefined();
    });

    test('button replies are private topic guides', async () => {
        const interaction = {
            customId: 'guide_panel_voice',
            guildId: 'guild_1',
            guildLocale: 'en',
            locale: 'en',
            user: { id: 'user_1' },
            reply: jest.fn().mockResolvedValue({}),
        };

        await guide.handleGuidePanelButton(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            flags: 64,
            embeds: expect.any(Array),
        }));
    });

    test('setup post button sends a public panel and private confirmation', async () => {
        const send = jest.fn().mockResolvedValue({ id: 'panel_message' });
        const interaction = {
            guildId: 'guild_1',
            guildLocale: 'en',
            locale: 'en',
            user: { id: 'manager_1' },
            client: { application: { id: '123456789' } },
            memberPermissions: { has: jest.fn().mockReturnValue(true) },
            channel: {
                isTextBased: () => true,
                send,
            },
            reply: jest.fn().mockResolvedValue({}),
        };

        await guide.handleGuidePanelPostButton(interaction);

        expect(send).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array),
            components: expect.any(Array),
            allowedMentions: { parse: [] },
        }));
        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            flags: 64,
            content: expect.any(String),
        }));
    });
});

function createInteraction(overrides = {}) {
    return {
        guildId: 'guild_1',
        guildLocale: 'en',
        locale: 'en',
        client: { application: { id: '123456789' } },
        user: { id: 'manager_1' },
        memberPermissions: { has: jest.fn().mockReturnValue(true) },
        options: {
            getString: jest.fn().mockReturnValue(null),
            getBoolean: jest.fn(name => name === 'panel'),
        },
        reply: jest.fn().mockResolvedValue({}),
        ...overrides,
    };
}
