/**
 * Servers that added only Pomo's commands (no bot): interaction.guild is null there,
 * so server commands get an "add Pomo" reply instead of crashing.
 */
const { initDatabase } = require('../utils/database');
const interactionCreate = require('../events/interactionCreate');
const studyroom = require('../commands/studyroom');

function slash(commandName, { guildId = 'foreign_guild', guild = null } = {}) {
    const execute = jest.fn().mockResolvedValue();
    return {
        commandName,
        guildId,
        guild,
        locale: 'en',
        user: { id: 'foreign_user' },
        client: { application: { id: '123' }, commands: new Map([[commandName, { data: { name: commandName }, execute }]]) },
        options: { data: [], getSubcommandGroup: () => null, getSubcommand: () => 'create' },
        isButton: () => false,
        isModalSubmit: () => false,
        isChannelSelectMenu: () => false,
        isStringSelectMenu: () => false,
        isAutocomplete: () => false,
        isChatInputCommand: () => true,
        reply: jest.fn().mockResolvedValue({}),
        execute,
    };
}

beforeAll(() => initDatabase());

describe('commands from a server without the Pomo bot', () => {
    test('server commands reply with an add-Pomo link instead of running', async () => {
        const interaction = slash('studyroom');
        await interactionCreate.execute(interaction);

        expect(interaction.execute).not.toHaveBeenCalled();
        const embed = interaction.reply.mock.calls[0][0].embeds[0].data;
        expect(embed.title).toContain("Pomo isn't in this server");
        expect(embed.description).toContain('/studyroom');
        expect(embed.description).toContain('client_id=123');
    });

    test('personal user-install commands still run there', async () => {
        const interaction = slash('study');
        await interactionCreate.execute(interaction);
        expect(interaction.execute).toHaveBeenCalled();
    });

    test('/studyroom in DMs says server only', async () => {
        const interaction = slash('studyroom', { guildId: null });
        await studyroom.execute(interaction);
        expect(interaction.reply.mock.calls[0][0].embeds[0].data.title).toContain('Server Only');
    });
});
