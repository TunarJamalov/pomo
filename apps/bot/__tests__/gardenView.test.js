/**
 * /garden draws an image, which can take longer than Discord's 3-second reply
 * window; the reply must be deferred before drawing.
 */
jest.mock('../utils/canvas', () => ({
    generateGardenBuffer: jest.fn(async () => Buffer.from('png')),
    generateGardenShareCard: jest.fn(),
}));

const { initDatabase, getOrCreateUser, db } = require('../utils/database');
const { generateGardenBuffer } = require('../utils/canvas');
const { sendGardenView } = require('../commands/garden');

function buildInteraction() {
    const interaction = {
        user: { id: 'garden_view_user' },
        locale: 'en',
        deferred: false,
        replied: false,
        deferReply: jest.fn(async () => { interaction.deferred = true; }),
        deferUpdate: jest.fn(async () => { interaction.deferred = true; }),
        editReply: jest.fn().mockResolvedValue({}),
        reply: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
    };
    return interaction;
}

beforeAll(() => {
    initDatabase();
    getOrCreateUser('garden_view_user');
});

beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM garden_plots WHERE user_id = ?').run('garden_view_user');
});

test('with plants: defers before drawing, then edits the reply with the image', async () => {
    db.prepare("INSERT INTO garden_plots (user_id, plant_type, stage, water_used) VALUES (?, 'carrot', 1, 0)").run('garden_view_user');
    const interaction = buildInteraction();
    generateGardenBuffer.mockImplementationOnce(async () => {
        expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
        return Buffer.from('png');
    });

    await sendGardenView(interaction, 'garden_view_user', false, 'en');

    expect(interaction.reply).not.toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.files).toHaveLength(1);
    expect(payload.embeds[0].data.image.url).toBe('attachment://garden.png');
});

test('button refresh with plants: defers the update and edits the message', async () => {
    db.prepare("INSERT INTO garden_plots (user_id, plant_type, stage, water_used) VALUES (?, 'carrot', 1, 0)").run('garden_view_user');
    const interaction = buildInteraction();

    await sendGardenView(interaction, 'garden_view_user', true, 'en');

    expect(interaction.deferUpdate).toHaveBeenCalled();
    expect(interaction.update).not.toHaveBeenCalled();
    const payload = interaction.editReply.mock.calls[0][0];
    expect(payload.attachments).toEqual([]);
    expect(payload.files).toHaveLength(1);
});

test('empty garden: nothing to draw, replies right away', async () => {
    const interaction = buildInteraction();

    await sendGardenView(interaction, 'garden_view_user', false, 'en');

    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ flags: 64 }));
});
