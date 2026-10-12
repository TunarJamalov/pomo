const POST_INTERVAL_MS = 30 * 60 * 1000;
let statsTimer = null;

const METRICS_URL = 'https://top.gg/api/v1/projects/@me/metrics';

/** Users who added Pomo through "Add to my apps"; null when Discord doesn't say. */
async function getUserInstallCount(client) {
    try {
        const application = await client.application?.fetch();
        const count = application?.approximateUserInstallCount;
        return Number.isInteger(count) ? count : null;
    } catch (_) {
        return null;
    }
}

// Top.gg v1 API: the token from "Integrations & API" sent as a Bearer token.
// Legacy (v0) tokens and /api/bots/:id/stats are being switched off.
async function postTopggStats(client) {
    const token = (process.env.TOPGG_API_TOKEN || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return { skipped: true };

    const serverCount = client.guilds.cache.size;
    const shardCount = client.shard?.count || 1;
    const userInstallCount = await getUserInstallCount(client);

    const metrics = { server_count: serverCount, shard_count: shardCount };
    if (userInstallCount !== null) metrics.user_install_count = userInstallCount;

    const response = await fetch(METRICS_URL, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(metrics),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Top.gg returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    const installs = userInstallCount !== null ? `, ${userInstallCount} user install(s)` : '';
    console.log(`[TOPGG] Posted stats: ${serverCount} server(s), ${shardCount} shard(s)${installs}.`);
    return { skipped: false, serverCount, shardCount, userInstallCount };
}

function startTopggStatsPoster(client) {
    if (!process.env.TOPGG_API_TOKEN) {
        console.log('[TOPGG] TOPGG_API_TOKEN not set; automatic server count posting is disabled.');
        return;
    }

    postTopggStats(client).catch(error => {
        console.error('[TOPGG] Initial stats post failed:', error.message);
    });

    if (statsTimer) clearInterval(statsTimer);
    statsTimer = setInterval(() => {
        postTopggStats(client).catch(error => {
            console.error('[TOPGG] Stats post failed:', error.message);
        });
    }, POST_INTERVAL_MS);
}

module.exports = {
    postTopggStats,
    startTopggStatsPoster,
};
