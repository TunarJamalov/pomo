/**
 * PomoBot — Main entry point.
 * Discord bot with Pomodoro timers, garden system, and economy.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const { initDatabase } = require('./utils/database');

// ─── Optional Proxy Support (for VDS providers that DPI-block Discord gateway) ─
// Set HTTPS_PROXY=http://host:port  or  HTTPS_PROXY=socks5://host:port  in .env
if (process.env.HTTPS_PROXY) {
    try {
        const { setGlobalDispatcher, ProxyAgent } = require('undici');
        const proxyAgent = new ProxyAgent(process.env.HTTPS_PROXY);
        setGlobalDispatcher(proxyAgent);
        console.log(`[PROXY] ✅ Routing Discord traffic via: ${process.env.HTTPS_PROXY}`);
    } catch (e) {
        console.warn('[PROXY] ⚠️  Failed to set proxy (undici not available?):', e.message);
    }
}

// ─── Initialize Database ─────────────────────────────────────
initDatabase();

// ─── Create Discord Client ───────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [
        Partials.Channel, // Required for DM support
    ],
});

// ─── Load Commands ───────────────────────────────────────────
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[CMD] Loaded command: /${command.data.name}`);
        } else {
            console.warn(`[CMD] ⚠️  Skipped ${file} — missing "data" or "execute" export.`);
        }
    }
}

// ─── Load Events ─────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        // Last line of defence: a rejected handler must never surface as an
        // uncaught exception. Expired interactions (10062) are routine.
        const run = (...args) => Promise.resolve()
            .then(() => event.execute(...args))
            .catch(error => {
                if (error?.code === 10062) {
                    console.warn(`[EVT] ${event.name}: interaction expired before Pomo replied (10062).`);
                } else {
                    console.error(`[EVT] Unhandled error in ${event.name}:`, error);
                }
            });
        if (event.once) {
            client.once(event.name, run);
        } else {
            client.on(event.name, run);
        }
        console.log(`[EVT] Loaded event: ${event.name}`);
    }
}

// ─── Global Error Handlers ───────────────────────────────────
process.on('uncaughtException', (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught Exception:`, error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[${new Date().toISOString()}] Unhandled Rejection at:`, promise, 'reason:', reason);
});

// ─── Login ───────────────────────────────────────────────────
// ─── Login with retry (handles transient ECONNRESET on VDS restart) ──────────
async function loginWithRetry(maxAttempts = 5, baseDelayMs = 10000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            await client.login(process.env.TOKEN);
            console.log('[LOGIN] ✅ Successfully connected to Discord.');
            startBackgroundJobs();
            return; // Success
        } catch (err) {
            // undici reports a VDS network/DNS outage as "Connect Timeout Error" or EAI_AGAIN
            const isNetworkError = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'Connect Timeout Error', 'fetch failed']
                .some(s => err.message?.includes(s)) ||
                ['ECONNRESET', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.code);

            if (isNetworkError && attempt < maxAttempts) {
                const delay = baseDelayMs * Math.pow(2, attempt - 1); // 10s, 20s, 40s...
                console.warn(`[LOGIN] ⚠️  Attempt ${attempt}/${maxAttempts} failed (${err.message}). Retrying in ${delay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                console.error(`[FATAL] Failed to login after ${attempt} attempt(s): ${err.message}`);
                process.exit(1);
            }
        }
    }
}

// A failing job must not take the whole bot down, so each one starts on its own.
function startBackgroundJobs() {
    const jobs = [
        ['vote webhook', () => {
            if (process.env.TOPGG_WEBHOOK_SECRET || process.env.TOPGG_TOKEN) {
                require('./commands/vote').setupVoteWebhook(client);
            }
        }],
        ['weekly report', () => require('./utils/weeklyReport').initWeeklyReportJob(client)],
        ['market prices', () => require('./utils/marketPrices').initMarketPriceJob()],
        ['weekly wrapped', () => require('./utils/weeklyWrapped').initWeeklyWrappedJob(client)],
        ['daily habits', () => require('./utils/dailyHabits').initDailyHabitsJob(client)],
        ['comeback reminders', () => require('./utils/nextSteps').startComebackReminderJob(client)],
    ];
    for (const [name, start] of jobs) {
        try {
            start();
        } catch (err) {
            console.error(`[JOBS] Failed to start ${name} job:`, err);
        }
    }
}

loginWithRetry();

// ─── Graceful Shutdown ───────────────────────────────────────
function shutdown(signal) {
    console.log(`[SHUTDOWN] ${signal} received, shutting down gracefully...`);
    client.destroy();
    const { db } = require('./utils/database');
    db.close();
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports.client = client;
