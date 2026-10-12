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

    test('posts server, shard and user-install counts to the v1 API', async () => {
        process.env.TOPGG_API_TOKEN = 'api_token';
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            text: async () => '',
        });
        const client = {
            guilds: { cache: new Map([['1', {}], ['2', {}]]) },
            shard: { count: 1 },
            user: { id: 'bot_id' },
            application: { fetch: jest.fn().mockResolvedValue({ approximateUserInstallCount: 40 }) },
        };

        const result = await postTopggStats(client);
        const [, options] = global.fetch.mock.calls[0];

        expect(result.serverCount).toBe(2);
        expect(global.fetch).toHaveBeenCalledWith(
            'https://top.gg/api/v1/projects/@me/metrics',
            expect.objectContaining({
                method: 'PATCH',
                headers: expect.objectContaining({ Authorization: 'Bearer api_token' }),
            }),
        );
        expect(JSON.parse(options.body)).toEqual({ server_count: 2, shard_count: 1, user_install_count: 40 });
    });

    test('still posts when the user-install count is unavailable', async () => {
        process.env.TOPGG_API_TOKEN = 'Bearer api_token';
        global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
        const client = {
            guilds: { cache: new Map([['1', {}]]) },
            application: { fetch: jest.fn().mockRejectedValue(new Error('offline')) },
        };

        await postTopggStats(client);
        const [, options] = global.fetch.mock.calls[0];
        expect(options.headers.Authorization).toBe('Bearer api_token');
        expect(JSON.parse(options.body)).toEqual({ server_count: 1, shard_count: 1 });
    });
});
