const { PermissionFlagsBits } = require('discord.js');
const { REQUIRED_BOT_PERMISSIONS, getBotInviteUrl } = require('../utils/invite');
const inviteCommand = require('../commands/invite');

describe('bot invite URL', () => {
    test('uses least-privilege permissions instead of Administrator', () => {
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.Administrator)).toBe(false);
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.ViewChannel)).toBe(true);
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.SendMessages)).toBe(true);
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.SendMessagesInThreads)).toBe(true);
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.EmbedLinks)).toBe(true);
        expect(REQUIRED_BOT_PERMISSIONS.has(PermissionFlagsBits.AttachFiles)).toBe(true);
    });

    test('builds a valid OAuth invite with slash commands', () => {
        const url = new URL(getBotInviteUrl('123456789'));

        expect(url.hostname).toBe('discord.com');
        expect(url.searchParams.get('client_id')).toBe('123456789');
        expect(url.searchParams.get('permissions')).toBe('274878286912');
        expect(url.searchParams.get('scope')).toBe('bot applications.commands');
    });

    test('invite command replies with share buttons', async () => {
        const interaction = {
            guildId: 'guild_1',
            guildLocale: 'en',
            locale: 'en',
            client: {
                application: { id: '123456789' },
                user: { id: '123456789' },
            },
            reply: jest.fn().mockResolvedValue({}),
        };

        await inviteCommand.execute(interaction);

        expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({
            embeds: expect.any(Array),
            components: expect.any(Array),
        }));

        const payload = interaction.reply.mock.calls[0][0];
        const inviteButton = payload.components[0].components[0];
        expect(inviteButton.data.url).toContain('client_id=123456789');
    });
});
