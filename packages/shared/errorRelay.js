/**
 * Mirrors a process's stderr (console.error / console.warn, i.e. what PM2 writes to
 * the error log) to a Discord channel, so bot and web errors show up in the support
 * server's error-log channel.
 *
 * Off unless ERROR_LOG_CHANNEL_ID is set. Repeats are grouped (numbers ignored) and
 * sent in batches with an hourly cap, so an outage or a noisy loop can't flood the
 * channel. Tokens and secrets from the environment are redacted before sending.
 * Nothing here calls console.*, so a failed send can't feed back into the relay.
 */
const util = require('util');

const FLUSH_MS = 10_000;
const MAX_MESSAGES_PER_HOUR = 30;
const MAX_GROUPS = 50;
const MAX_SAMPLE = 1200;
const MESSAGE_LIMIT = 1950;

const SECRET_ENV = /(TOKEN|SECRET|KEY|PASSWORD|DATABASE_URL)/i;

function redact(text) {
    let out = text
        // Interaction and webhook tokens sit in Discord API URLs
        .replace(/(\/interactions\/\d+\/)[\w.-]+/g, '$1[redacted]')
        .replace(/(\/webhooks\/\d+\/)[\w.-]+/g, '$1[redacted]')
        .replace(/(Bot |Bearer )[\w.-]{20,}/g, '$1[redacted]');
    for (const [name, value] of Object.entries(process.env)) {
        if (value && value.length >= 8 && SECRET_ENV.test(name)) out = out.split(value).join('[redacted]');
    }
    return out;
}

/** Same error, different ids/counts/times → same group. */
function groupKey(level, text) {
    const firstLine = text.split('\n', 1)[0];
    return `${level}:${firstLine.replace(/\d+/g, '#').slice(0, 200)}`;
}

function formatGroup(source, group) {
    const count = group.count > 1 ? ` ×${group.count}` : '';
    const icon = group.level === 'error' ? '🔴' : '🟡';
    const sample = group.sample.length > MAX_SAMPLE ? `${group.sample.slice(0, MAX_SAMPLE)}\n…` : group.sample;
    return `${icon} **${source}** ${group.level}${count}\n\`\`\`\n${sample.replace(/```/g, "'''")}\n\`\`\``;
}

function installErrorRelay({ source, tokenEnv, fetchImpl = (...args) => fetch(...args) }) {
    const original = { error: console.error, warn: console.warn };
    const groups = new Map();
    let heldBack = 0;
    let sentThisHour = 0;
    let hourStartedAt = Date.now();
    let timer = null;
    let warnedBadReply = false;

    function capture(level, args) {
        if (!process.env.ERROR_LOG_CHANNEL_ID) return;
        let text;
        try {
            text = redact(util.format(...args)).trim();
        } catch (_) {
            return;
        }
        if (!text) return;
        const key = groupKey(level, text);
        const group = groups.get(key);
        if (group) group.count++;
        else if (groups.size < MAX_GROUPS) groups.set(key, { level, sample: text, count: 1 });
        else heldBack++;
        if (!timer) {
            timer = setTimeout(flush, FLUSH_MS);
            timer.unref?.();
        }
    }

    async function post(content) {
        const channelId = process.env.ERROR_LOG_CHANNEL_ID;
        const token = process.env[tokenEnv];
        if (!channelId || !token) return;
        const res = await fetchImpl(`https://discord.com/api/v10/channels/${channelId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
        });
        if (!res.ok && !warnedBadReply) {
            warnedBadReply = true;
            original.warn(`[ERRLOG] Discord replied ${res.status}: check ERROR_LOG_CHANNEL_ID and that the bot can post there.`);
        }
    }

    async function flush() {
        if (timer) clearTimeout(timer);
        timer = null;
        if (groups.size === 0) return;
        const batch = [...groups.values()];
        groups.clear();

        if (Date.now() - hourStartedAt > 60 * 60 * 1000) {
            hourStartedAt = Date.now();
            sentThisHour = 0;
        }

        // Pack groups into as few messages as fit
        const messages = [];
        let current = '';
        for (const group of batch) {
            const block = formatGroup(source, group);
            if (current && current.length + block.length + 1 > MESSAGE_LIMIT) {
                messages.push(current);
                current = '';
            }
            current = current ? `${current}\n${block}` : block;
        }
        if (current) messages.push(current);

        try {
            for (const content of messages) {
                if (sentThisHour >= MAX_MESSAGES_PER_HOUR) {
                    heldBack++;
                    continue;
                }
                const note = heldBack ? `\n-# ${heldBack} more held back by the hourly limit` : '';
                sentThisHour++;
                heldBack = 0;
                await post((content + note).slice(0, 2000));
            }
        } catch (_) {
            // Discord unreachable (often the same outage that caused the errors): drop this batch
        }
    }

    console.error = (...args) => {
        original.error(...args);
        capture('error', args);
    };
    console.warn = (...args) => {
        original.warn(...args);
        capture('warn', args);
    };

    return {
        flush,
        uninstall() {
            console.error = original.error;
            console.warn = original.warn;
            if (timer) clearTimeout(timer);
            timer = null;
        },
    };
}

module.exports = { installErrorRelay, redact, groupKey };
