/**
 * Error relay: stderr lines go to the support server's error-log channel,
 * grouped, capped and with secrets removed.
 */
const { installErrorRelay } = require('../../../packages/shared/errorRelay');

describe('error relay', () => {
    let relay;
    let fetchImpl;
    let warnSpy;
    const saved = {};

    beforeEach(() => {
        for (const key of ['ERROR_LOG_CHANNEL_ID', 'TOKEN', 'TOPGG_TOKEN']) saved[key] = process.env[key];
        process.env.ERROR_LOG_CHANNEL_ID = '1566129713133396009';
        process.env.TOKEN = 'bot-token-abcdefghijklmnop';
        process.env.TOPGG_TOKEN = 'topgg-secret-123456';
        // The relay keeps calling the console methods it wrapped; keep test output quiet
        jest.spyOn(console, 'error').mockImplementation(() => {});
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });
        relay = installErrorRelay({ source: 'bot', tokenEnv: 'TOKEN', fetchImpl });
    });

    afterEach(() => {
        relay.uninstall();
        jest.restoreAllMocks();
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    const sent = () => fetchImpl.mock.calls.map(([, init]) => JSON.parse(init.body));

    test('posts to the channel with the bot token and no mentions', async () => {
        console.error('[TEAM] Complete notification error: boom');
        await relay.flush();

        const [url, init] = fetchImpl.mock.calls[0];
        expect(url).toBe('https://discord.com/api/v10/channels/1566129713133396009/messages');
        expect(init.headers.Authorization).toBe('Bot bot-token-abcdefghijklmnop');
        expect(sent()[0].allowed_mentions).toEqual({ parse: [] });
        expect(sent()[0].content).toContain('🔴 **bot** error');
        expect(sent()[0].content).toContain('Complete notification error: boom');
    });

    test('groups repeats that differ only in numbers', async () => {
        console.warn('[TIMER] Failed to edit message for session 19285: timeout');
        console.warn('[TIMER] Failed to edit message for session 19281: timeout');
        console.warn('[TIMER] Failed to edit message for session 19286: timeout');
        console.error('[GOAL] Completion announcement failed for guild 1: Missing Access');
        await relay.flush();

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const { content } = sent()[0];
        expect(content).toContain('🟡 **bot** warn ×3');
        expect(content).toContain('Completion announcement failed');
    });

    test('removes tokens, secrets and interaction tokens', async () => {
        const err = new Error('Unknown interaction');
        console.error('POST https://discord.com/api/v10/interactions/1564548823760764928/aW50ZXJhY3Rpb24.abc_def/callback', err);
        console.error('top.gg replied for topgg-secret-123456 with bot-token-abcdefghijklmnop');
        await relay.flush();

        const { content } = sent()[0];
        expect(content).toContain('/interactions/1564548823760764928/[redacted]/callback');
        expect(content).not.toContain('aW50ZXJhY3Rpb24');
        expect(content).not.toContain('topgg-secret-123456');
        expect(content).not.toContain('bot-token-abcdefghijklmnop');
        expect(content).toContain('Error: Unknown interaction');
    });

    test('stays off without ERROR_LOG_CHANNEL_ID', async () => {
        delete process.env.ERROR_LOG_CHANNEL_ID;
        console.error('nobody should see this');
        await relay.flush();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('sends at most 30 messages an hour', async () => {
        for (let i = 0; i < 32; i++) {
            console.error(`distinct failure ${'x'.repeat(i)}`);
            await relay.flush();
        }
        expect(fetchImpl).toHaveBeenCalledTimes(30);
    });

    test('a Discord outage never throws out of the relay', async () => {
        fetchImpl.mockRejectedValue(new Error('fetch failed'));
        console.error('[FATAL] Failed to login');
        await expect(relay.flush()).resolves.toBeUndefined();
    });

    test('a rejected post warns once with the reason', async () => {
        fetchImpl.mockResolvedValue({ ok: false, status: 403 });
        console.error('first');
        await relay.flush();
        console.error('second');
        await relay.flush();
        const relayWarnings = warnSpy.mock.calls.filter(args => String(args[0]).startsWith('[ERRLOG]'));
        expect(relayWarnings).toHaveLength(1);
        expect(relayWarnings[0][0]).toContain('403');
    });
});
