/**
 * /vote — Shows top.gg vote link and handles vote rewards.
 * Also sets up an Express webhook endpoint for automatic vote rewards.
 */

const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Colors, Plants } = require('../utils/constants');
const { getInteractionLanguage, t } = require('../utils/i18n');

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for the bot on Top.gg and earn water!'),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const topggUrl = process.env.CLIENT_ID
            ? `https://top.gg/bot/${process.env.CLIENT_ID}/vote`
            : 'https://top.gg';

        const embed = new EmbedBuilder()
            .setColor(Colors.PRIMARY)
            .setTitle(`🗳️ ${t(language, 'voteTitle')}`)
            .setDescription(t(language, 'voteBody'))
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel(t(language, 'voteButton'))
                .setStyle(ButtonStyle.Link)
                .setURL(topggUrl)
                .setEmoji('🗳️')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    },
};

/**
 * Set up Top.gg webhook on an Express server.
 * Uses HMAC-SHA256 signature verification (new top.gg format).
 */
function isLocalRequest(req) {
    const ip = req.socket.remoteAddress;
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** Signed webhooks older/newer than this are rejected (replay protection). */
const MAX_TIMESTAMP_SKEW_SECONDS = 5 * 60;
/** Top.gg allows one vote per 12 hours; anything sooner is a duplicate delivery. */
const VOTE_DEDUPE_MS = 11 * 60 * 60 * 1000;

function safeEqual(a, b) {
    const left = Buffer.from(String(a), 'utf8');
    const right = Buffer.from(String(b), 'utf8');
    if (left.length !== right.length) return false;
    return require('crypto').timingSafeEqual(left, right);
}

function isFreshTimestamp(timestamp, nowMs = Date.now()) {
    if (!/^\d{1,16}$/.test(timestamp)) return false;
    let seconds = Number(timestamp);
    // Accept both unix seconds and milliseconds.
    if (seconds > 1e12) seconds = Math.floor(seconds / 1000);
    return Math.abs(nowMs / 1000 - seconds) <= MAX_TIMESTAMP_SKEW_SECONDS;
}

function verifyTopggSignature(rawBody, signatureHeader, secret, { checkTimestamp = true, nowMs = Date.now() } = {}) {
    const sigObj = Object.fromEntries(
        signatureHeader.split(',').map((part) => {
            const [key, ...valueParts] = part.split('=');
            return [key, valueParts.join('=')];
        })
    );

    const timestamp = sigObj.t?.trim();
    const receivedSig = sigObj.v1?.trim().toLowerCase();
    if (!timestamp || !receivedSig) return false;
    if (checkTimestamp && !isFreshTimestamp(timestamp, nowMs)) return false;

    const expected = require('crypto')
        .createHmac('sha256', secret.trim())
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

    return safeEqual(receivedSig, expected);
}

/** Remembers recent rewards so a re-sent webhook cannot pay twice. */
const recentVotes = new Map();
function isDuplicateVote(userId, nowMs = Date.now()) {
    for (const [id, at] of recentVotes) {
        if (nowMs - at >= VOTE_DEDUPE_MS) recentVotes.delete(id);
    }
    if (recentVotes.has(userId)) return true;
    recentVotes.set(userId, nowMs);
    return false;
}

function getWebhookSecret() {
    return (process.env.TOPGG_WEBHOOK_SECRET || process.env.TOPGG_TOKEN || '').trim();
}

function isAuthorizedTopggRequest(req, rawBody, secret) {
    const signatureHeader = req.headers['x-topgg-signature'];
    if (signatureHeader && verifyTopggSignature(rawBody, signatureHeader, secret)) {
        return true;
    }

    const authHeader = req.headers.authorization || '';
    const legacyToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    return Boolean(legacyToken && safeEqual(legacyToken, secret));
}

function isVoteEvent(eventType) {
    return !eventType || eventType === 'vote.create' || eventType === 'upvote' || eventType === 'vote';
}

function isTestEvent(eventType) {
    return eventType === 'webhook.test' || eventType === 'test';
}

function getVoterId(body = {}) {
    return body?.data?.user?.platform_id || body?.user;
}

/**
 * Pick 1-2 random fruits for vote reward (rarer than daily — higher apple chance).
 */
function getVoteFruits() {
    const weights = { carrot: 30, tomato: 30, potato: 25, apple: 15 };
    const pool = [];
    for (const [key, w] of Object.entries(weights)) {
        for (let i = 0; i < w; i++) pool.push(key);
    }
    const count = Math.random() < 0.6 ? 2 : 1; // 60% chance of 2 fruits (better than daily)
    const fruits = {};
    for (let i = 0; i < count; i++) {
        const key = pool[Math.floor(Math.random() * pool.length)];
        fruits[key] = (fruits[key] || 0) + 1;
    }
    return fruits;
}

function setupVoteWebhook(client) {
    const express = require('express');
    const { getOrCreateUser, incrementUser, db } = require('../utils/database');
    const { successEmbed } = require('../utils/embeds');

    const TOPGG_SECRET = getWebhookSecret();

    if (!TOPGG_SECRET) {
        console.log('[VOTE] TOPGG_WEBHOOK_SECRET/TOPGG_TOKEN not set, vote webhooks are inactive.');
        return;
    }

    const secretKind = TOPGG_SECRET.startsWith('whs_') ? 'v1 (whs_)' : 'custom/legacy';
    console.log(`[VOTE] Webhook secret loaded (${secretKind}).`);

    const app = express();
    app.use(express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf.toString('utf-8');
        },
    }));

    // Called by pomofocus-web after it verifies the Top.gg signature.
    app.post('/topgg/process', async (req, res) => {
        if (!isLocalRequest(req)) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        try {
            const { userId, eventType, weight = 1 } = req.body || {};

            if (isTestEvent(eventType)) {
                return res.status(200).json({ ok: true, skipped: true });
            }

            if (!userId) {
                return res.status(400).json({ error: 'Missing user ID' });
            }

            if (!isVoteEvent(eventType)) {
                console.log(`[VOTE] Skipping non-vote event from web process: ${eventType || 'unknown'}`);
                return res.status(200).json({ ok: true, skipped: true });
            }

            const waterReward = 30 * Math.max(1, Number(weight) || 1);
            await processVoteReward(client, userId, waterReward);
            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error('[VOTE] Internal process error:', err);
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    // Direct Top.gg hits (local testing / fallback).
    app.post('/topgg/webhook', async (req, res) => {
        try {
            const signatureHeader = req.headers['x-topgg-signature'];
            const authHeader = req.headers.authorization;
            if (!signatureHeader && !authHeader) {
                console.warn('[VOTE] Missing Top.gg signature/authorization header.');
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const rawBody = req.rawBody || '';
            if (!isAuthorizedTopggRequest(req, rawBody, TOPGG_SECRET)) {
                console.warn('[VOTE] Top.gg authorization mismatch — unauthorized request.');
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const body = req.body || {};
            const eventType = body.type;
            console.log(`[VOTE] Top.gg event received: ${eventType}`);

            if (isTestEvent(eventType)) {
                console.log('[VOTE] Test webhook received successfully! Signature verified. ✅');
                return res.status(200).json({ ok: true, message: 'Test received' });
            }

            if (!isVoteEvent(eventType)) {
                console.log(`[VOTE] Skipping non-vote event: ${eventType || 'unknown'}`);
                return res.status(200).json({ ok: true, skipped: true });
            }

            const userId = getVoterId(body);
            if (!userId) {
                console.warn('[VOTE] Could not determine user ID from webhook body.');
                return res.status(400).json({ error: 'Missing user ID' });
            }

            const weight = body?.data?.weight ?? 1;
            const waterReward = 30 * Math.max(1, Number(weight) || 1);
            await processVoteReward(client, userId, waterReward);
            return res.status(200).json({ ok: true });
        } catch (err) {
            console.error('[VOTE] Webhook processing error:', err);
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    async function processVoteReward(client, userId, waterReward = 30) {
        if (!/^\d{17,20}$/.test(String(userId))) {
            console.warn(`[VOTE] Ignoring vote with invalid user ID: ${userId}`);
            return;
        }
        if (isDuplicateVote(String(userId))) {
            console.warn(`[VOTE] Duplicate vote for ${userId} ignored (already rewarded in the last 11h).`);
            return;
        }
        try {
            getOrCreateUser(userId);
            incrementUser(userId, 'water', waterReward);

            // Grant random fruits as bonus
            const fruits = getVoteFruits();
            for (const [key, qty] of Object.entries(fruits)) {
                db.prepare(`
                    INSERT INTO inventory (user_id, item_key, quantity)
                    VALUES (?, ?, ?)
                    ON CONFLICT(user_id, item_key) DO UPDATE SET quantity = quantity + excluded.quantity
                `).run(userId, key, qty);
            }
            const fruitLines = Object.entries(fruits)
                .map(([k, qty]) => `${Plants[k].emoji} ${qty}x ${Plants[k].name}`)
                .join(', ');

            console.log(`[VOTE] User ${userId} awarded ${waterReward} 💧 + ${fruitLines} for voting.`);

            let dmSent = false;
            try {
                const discordUser = await client.users.fetch(userId);
                const embed = successEmbed(
                    '🗳️ Thank You for Voting!',
                    `You received **+${waterReward} 💧 water** and **${fruitLines}** as a reward for voting for Pomo on Top.gg! 🎉\n\n*You can vote again in 12 hours.*`
                );
                await discordUser.send({ embeds: [embed] });
                console.log(`[VOTE] Sent DM reward to ${discordUser.tag}.`);
                dmSent = true;
            } catch (e) {
                console.warn(`[VOTE] Could not DM user ${userId} (DMs probably closed).`);
            }

            // If DM failed, log to owner channel so the reward isn't silently missed
            if (!dmSent && process.env.OWNER_LOG_CHANNEL_ID) {
                try {
                    const logChannel = await client.channels.fetch(process.env.OWNER_LOG_CHANNEL_ID).catch(() => null);
                    if (logChannel) {
                        const { EmbedBuilder } = require('discord.js');
                        const notice = new EmbedBuilder()
                            .setColor(0xFFA500)
                            .setTitle('🗳️ Vote Reward — DM Failed')
                            .setDescription(
                                `<@${userId}> voted and received **+${waterReward} 💧** but their DMs are closed.\n` +
                                `They can verify with \`/profile\`.`
                            )
                            .setTimestamp();
                        await logChannel.send({ embeds: [notice] });
                    }
                } catch (_) {
                    // Silently ignore log channel errors
                }
            }
        } catch (err) {
            console.error('[VOTE] Reward processing error:', err);
        }
    }

    // Top.gg reaches the website, which forwards to /topgg/process on localhost,
    // so the bot does not need to be reachable from the internet.
    const port = process.env.VOTE_WEBHOOK_PORT || 5000;
    const host = process.env.VOTE_WEBHOOK_HOST || '127.0.0.1';
    app.listen(port, host, () => {
        console.log(`[VOTE] Top.gg webhook listening on ${host}:${port} (HMAC verification enabled)`);
    });
}

module.exports.setupVoteWebhook = setupVoteWebhook;
module.exports._test = {
    getVoterId,
    isTestEvent,
    isVoteEvent,
    verifyTopggSignature,
    isFreshTimestamp,
    isDuplicateVote,
};
