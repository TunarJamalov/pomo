const { postTopggStats } = require('../utils/topggStats');

describe('Top.gg stats poster', () => {
    const originalToken = process.env.TOPGG_API_TOKEN;
    const originalClientId = process.env.CLIENT_ID;
    const originalFetch = global.fetch;

    afterEach(() => {
        if (originalToken === undefined) delete process.env.TOPGG_API_TOKEN;
        else process.env.TOPGG_API_TOKEN = originalToken;
        if (originalClientId === undefined) delete process.env.CLIENT_ID;
        else process.env.CLIENT_ID = originalClientId;
        global.fetch = originalFetch;
    });

    test('skips safely when the API token is missing', async () => {
        delete process.env.TOPGG_API_TOKEN;
        const result = await postTopggStats({ guilds: { cache: new Map() }, user: { id: 'bot' } });
        expect(result.skipped).toBe(true);
    });

    test('posts the current server and shard count', async () => {
        process.env.TOPGG_API_TOKEN = 'api_token';
        process.env.CLIENT_ID = 'bot_id';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => '',
        });
        const client = {
            guilds: { cache: new Map([['1', {}], ['2', {}]]) },
            shard: { count: 1 },
            user: { id: 'bot_id' },
        };

        const result = await postTopggStats(client);
        const [, options] = global.fetch.mock.calls[0];

        expect(result.serverCount).toBe(2);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://top.gg/api/bots/bot_id/stats',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({ Authorization: 'api_token' }),
            }),
        );
        expect(JSON.parse(options.body)).toEqual({ server_count: 2, shard_count: 1 });
    });
});
