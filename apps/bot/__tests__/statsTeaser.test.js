jest.mock('../utils/canvas', () => ({ generateStatsDashboard: jest.fn().mockResolvedValue(Buffer.from('png')) }));

const { initDatabase, db, getOrCreateUser } = require('../utils/database');
const stats = require('../commands/stats');

const FREE = '320000000000000001';
const NEW_USER = '320000000000000002';
const salesOpen = process.env.PRO_SALES_OPEN;

function statsInteraction(userId, view) {
    return {
        user: { id: userId, username: 'tester' },
        locale: 'en-US',
        client: { guilds: { fetch: jest.fn().mockRejectedValue(new Error('no guild')) } },
        options: { getString: name => (name === 'view' ? view : null) },
        deferReply: jest.fn().mockResolvedValue(null),
        editReply: jest.fn().mockResolvedValue(null),
    };
}

beforeAll(() => initDatabase());
beforeEach(() => {
    process.env.PRO_SALES_OPEN = 'true';
    db.prepare("DELETE FROM study_sessions WHERE user_id LIKE '3200%'").run();
    db.prepare("DELETE FROM premium_events WHERE user_id LIKE '3200%'").run();
    [FREE, NEW_USER].forEach(getOrCreateUser);
    // Six 25-minute sessions at 19:00 UTC over the last week
    const insert = db.prepare(`
        INSERT INTO study_sessions (user_id, duration, title, started_at, completed)
        VALUES (?, 25, 'Study', datetime('now', ?, 'start of day', '+19 hours'), 1)
    `);
    for (let day = 1; day <= 6; day++) insert.run(FREE, `-${day} days`);
});
afterAll(() => {
    if (salesOpen === undefined) delete process.env.PRO_SALES_OPEN;
    else process.env.PRO_SALES_OPEN = salesOpen;
});

describe('/stats Pro teaser', () => {
    test('basic stats show a free user their best hour once Pro can be bought', async () => {
        const interaction = statsInteraction(FREE, 'basic');
        await stats.execute(interaction);
        const { content } = interaction.editReply.mock.calls[0][0];
        expect(content).toContain('You study most around');
        expect(content).toContain('100% of your focus time');
    });

    test('no teaser while sales are closed, or without enough sessions', async () => {
        process.env.PRO_SALES_OPEN = 'false';
        const closed = statsInteraction(FREE, 'basic');
        await stats.execute(closed);
        expect(closed.editReply.mock.calls[0][0].content).not.toContain('You study most');

        process.env.PRO_SALES_OPEN = 'true';
        const fresh = statsInteraction(NEW_USER, 'basic');
        await stats.execute(fresh);
        expect(fresh.editReply.mock.calls[0][0].content).not.toContain('You study most');
    });

    test('the locked advanced view previews the best hour and offers the trial', async () => {
        const interaction = statsInteraction(FREE, 'advanced');
        await stats.execute(interaction);
        const reply = interaction.editReply.mock.calls[0][0];
        const description = reply.embeds[0].data.description;
        expect(description).toContain('From your own data');
        expect(description).toContain('/dataexport');
        expect(description).not.toContain('Beta');
        const ids = reply.components[0].components.map(c => c.data.custom_id).filter(Boolean);
        expect(ids).toContain('pro_trial_start');
    });
});
