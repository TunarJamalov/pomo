const POST_INTERVAL_MS = 30 * 60 * 1000;
let statsTimer = null;

async function postTopggStats(client) {
    const token = process.env.TOPGG_API_TOKEN;
    const clientId = process.env.CLIENT_ID || client.user?.id;
    if (!token || !clientId) return { skipped: true };

    const serverCount = client.guilds.cache.size;
    const shardCount = client.shard?.count || 1;
    const response = await fetch(`https://top.gg/api/bots/${clientId}/stats`, {
        method: 'POST',
        headers: {
            Authorization: token,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            server_count: serverCount,
            shard_count: shardCount,
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Top.gg returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    }

    console.log(`[TOPGG] Posted stats: ${serverCount} server(s), ${shardCount} shard(s).`);
    return { skipped: false, serverCount, shardCount };
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
