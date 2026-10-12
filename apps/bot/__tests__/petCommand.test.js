/**
 * /pet inventory, equip and the equip autocomplete must find pets by the
 * user's Discord id (regression: they passed the Discord id where the pet
 * repository expects users.id, so every list came back empty).
 */
const { initDatabase, getOrCreateUser, addPet, getActivePet } = require('../utils/database');
const petCommand = require('../commands/pet');

const USER_ID = '827293519420063744';

function buildInteraction({ subcommand, name, focused = '' }) {
    return {
        user: { id: USER_ID, displayAvatarURL: () => 'https://example.com/a.png' },
        guildId: null,
        locale: 'en',
        options: {
            getSubcommand: () => subcommand,
            getString: key => (key === 'name' ? name : null),
            getFocused: () => focused,
        },
        reply: jest.fn().mockResolvedValue({}),
        respond: jest.fn().mockResolvedValue({}),
    };
}

beforeAll(() => {
    initDatabase();
    getOrCreateUser(USER_ID);
    addPet(USER_ID, 'study_ant');
    addPet(USER_ID, 'wise_owl');
});

describe('/pet with pets stored under the Discord id', () => {
    test('inventory lists every owned pet', async () => {
        const interaction = buildInteraction({ subcommand: 'inventory' });
        await petCommand.execute(interaction);

        const description = interaction.reply.mock.calls[0][0].embeds[0].data.description;
        expect(description).toContain('Study Ant');
        expect(description).toContain('Wise Owl');
    });

    test('equip autocomplete suggests owned pets', async () => {
        const interaction = buildInteraction({ subcommand: 'equip' });
        await petCommand.autocomplete(interaction);

        const values = interaction.respond.mock.calls[0][0].map(choice => choice.value);
        expect(values).toEqual(expect.arrayContaining(['study_ant', 'wise_owl']));
    });

    test('equip switches the active pet', async () => {
        expect(getActivePet(USER_ID).pet_key).toBe('study_ant');

        const interaction = buildInteraction({ subcommand: 'equip', name: 'owl' });
        await petCommand.execute(interaction);

        expect(getActivePet(USER_ID).pet_key).toBe('wise_owl');
        expect(interaction.reply.mock.calls[0][0].flags).toBeUndefined();
    });
});
