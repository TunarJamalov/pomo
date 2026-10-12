/**
 * /findbuddy — Match users for accountability study sessions.
 *
 * Flow: /findbuddy creates a queue request → best compatible candidate
 * is shown as a card (subject/duration/mode only, no user identity) →
 * requester can Like / Pass / Block → mutual Likes finalize atomically.
 */

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');
const { Colors } = require('../utils/constants');
const { successEmbed, errorEmbed } = require('../utils/embeds');
const { getInteractionLanguage } = require('../utils/i18n');
const {
    getOrCreateUser,
    createBuddyRequest,
    getWaitingBuddyRequests,
    getGlobalWaitingBuddyRequests,
    expireStaleBuddyRequests,
    isBuddyBlocked,
    blockBuddyUser,
    isBuddyUnmatched,
    hasBuddyMatchHistory,
    unmatchBuddyPair,
    createBuddyReport,
    normalizeBuddyReportReason,
    countRecentBuddyRequests,
    recordBuddySwipe,
    hasBuddyLiked,
    getBuddyActedUserIds,
    getActiveSessionForUser,
    isGlobalBuddyMatchingEnabled,
    getEligibleStudyHubs,
    setBuddyDestination,
    getMatchDestinationState,
    buddyMatchKey,
    recordHubConsent,
    getHubConsents,
    clearHubConsents,
    claimHubInvite,
    getHubInvite,
    markHubInviteSent,
    markHubInviteFailed,
    isStudyHubEnabled,
    isStudyHubAcceptingGuests,
    matchBuddyPair,
    recordBuddyEvent,
    db,
} = require('../utils/database');

const MATCH_THRESHOLD = 50;
const MAX_SCORE = 80;

// Abuse protection: generous sliding-window limits (in-memory, per process).
// - swipes: normal browsing is a handful of taps; 30/10min only stops bots.
// - unmatch: ending matches is rare; 5/hour is plenty.
// - new requests: one active request per user already; 10/hour stops churn.
function createRateLimiter(limit, windowMs) {
    const hits = new Map();
    return {
        check(key, now = Date.now()) {
            const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
            if (arr.length >= limit) {
                hits.set(key, arr);
                return false;
            }
            arr.push(now);
            hits.set(key, arr);
            return true;
        },
        reset() { hits.clear(); },
    };
}

const swipeLimiter = createRateLimiter(30, 10 * 60 * 1000);
const unmatchLimiter = createRateLimiter(5, 60 * 60 * 1000);
const BUDDY_REQUESTS_PER_HOUR = 10;

function scoreBuddyMatch(candidate, { subject, duration, mode }) {
    let score = 0;
    if (candidate.subject && candidate.subject.toLowerCase() === subject.toLowerCase()) score += 30;
    if (Math.abs(candidate.duration - duration) <= 15) score += 30;
    else if (Math.abs(candidate.duration - duration) <= 30) score += 10;
    if (candidate.mode === mode) score += 20;
    return score;
}

function isCandidateEligible(candidate, userId) {
    if (!candidate || candidate.user_id === userId) return false;
    if (isBuddyBlocked(userId, candidate.user_id)) return false;
    if (isBuddyUnmatched(userId, candidate.user_id)) return false;
    if (getActiveSessionForUser(candidate.user_id)) return false;
    return true;
}

function isRequestFresh(row) {
    if (!row || row.status !== 'waiting') return false;
    const created = new Date(String(row.created_at).replace(' ', 'T') + 'Z').getTime();
    if (Number.isNaN(created)) return false;
    return Date.now() - created <= 30 * 60 * 1000;
}

// Local/global classification for analytics: same guild as the viewer is
// local, different guild is global, unknown viewer guild (e.g. DM buttons)
// yields null scope rather than a wrong claim.
function buddyEventScope(viewerGuildId, otherGuildId) {
    if (!viewerGuildId || !otherGuildId) return null;
    return viewerGuildId === otherGuildId ? 'local' : 'global';
}

function findBestCandidate({ userId, myRequestId, prefs, guildId, excludeUserIds = new Set() }) {
    const seen = new Set([myRequestId]);
    let best = null;
    let bestScore = 0;

    const consider = (candidate) => {
        if (seen.has(candidate.id)) return;
        seen.add(candidate.id);
        if (candidate.user_id === userId) return;
        if (excludeUserIds.has(candidate.user_id)) return;
        if (!isCandidateEligible(candidate, userId)) return;
        const score = scoreBuddyMatch(candidate, prefs);
        if (score > bestScore) {
            bestScore = score;
            best = candidate;
        }
    };

    // Local pass first: same-server candidates (existing behavior preserved)
    if (guildId) {
        for (const candidate of getWaitingBuddyRequests(guildId)) consider(candidate);
    }

    // Global fallback: cross-server queue (excludes already-considered).
    // Only when THIS server opted in — OFF servers neither contribute to
    // nor consume from the global pool. Local matching above is unaffected.
    if ((!best || bestScore < MATCH_THRESHOLD) && isGlobalBuddyMatchingEnabled(guildId)) {
        for (const candidate of getGlobalWaitingBuddyRequests()) consider(candidate);
    }

    return { candidate: best, score: bestScore };
}

function candidateCardPayload({ candidate, prefs, score, myRequestId, guildId, likedYou }) {
    const pct = Math.round((score / MAX_SCORE) * 100);
    const sameServer = guildId && candidate.guild_id === guildId;

    const embed = new EmbedBuilder()
        .setColor(Colors.PRIMARY)
        .setTitle('🔎 Compatible Study Partner Found')
        .setDescription(
            `**Compatibility:** ${pct}%\n\n` +
            `📚 **Subject:** ${candidate.subject || prefs.subject}\n` +
            `⏱️ **Duration:** ${candidate.duration} minutes\n` +
            `🎙️ **Mode:** ${candidate.mode === 'voice' ? 'Voice' : 'Silent'}\n` +
            `📍 **Where:** ${sameServer ? 'Same server' : 'Another server'}\n` +
            (likedYou ? `\n💘 **This person already liked you!**` : ``) +
            `\nLike to connect, Pass to skip, Block to never match.`
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buddy_like_${candidate.id}_${myRequestId}`)
            .setLabel('❤️ Like')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`buddy_pass_${candidate.id}_${myRequestId}`)
            .setLabel('⏭️ Pass')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`buddy_blockreq_${candidate.id}_${myRequestId}`)
            .setLabel('🚫 Block')
            .setStyle(ButtonStyle.Danger),
    );

    const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buddy_cancel_${myRequestId}`)
            .setLabel('Cancel Request')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, cancelRow] };
}

function noCandidatePayload(myRequestId) {
    const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('🔎 Finding your study partner...')
        .setDescription(
            `No more compatible people right now. Your request stays active for **30 minutes**.\n\n` +
            `Tip: Share this with friends so they can search with similar settings!`
        );

    const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buddy_cancel_${myRequestId}`)
            .setLabel('Cancel Request')
            .setStyle(ButtonStyle.Danger)
    );

    return { embeds: [embed], components: [cancelRow] };
}

function getMyWaitingRequest(myRequestId, userId) {
    const row = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(myRequestId);
    if (!row || row.user_id !== userId || row.status !== 'waiting') return null;
    if (!isRequestFresh(row)) return null;
    return row;
}

async function advanceQueue(interaction, userId, myRequestId) {
    const myReq = getMyWaitingRequest(myRequestId, userId);
    if (!myReq) {
        return interaction.update({
            embeds: [errorEmbed('Request Expired', 'Your buddy request is no longer active. Run `/findbuddy` again to keep looking.')],
            components: [],
        });
    }

    try { expireStaleBuddyRequests(); } catch (_) {}

    const prefs = { subject: myReq.subject, duration: myReq.duration, mode: myReq.mode || 'silent' };
    const excludeUserIds = new Set(getBuddyActedUserIds(userId));
    const { candidate, score } = findBestCandidate({
        userId,
        myRequestId,
        prefs,
        guildId: interaction.guildId,
        excludeUserIds,
    });

    if (!candidate || score < MATCH_THRESHOLD) {
        return interaction.update(noCandidatePayload(myRequestId));
    }

    const likedYou = hasBuddyLiked(candidate.user_id, userId);
    recordBuddyEvent('buddy_candidate_shown', {
        userId,
        guildId: interaction.guildId,
        requestId: myRequestId,
        scope: buddyEventScope(interaction.guildId, candidate.guild_id),
    });
    return interaction.update(candidateCardPayload({
        candidate,
        prefs,
        score,
        myRequestId,
        guildId: interaction.guildId,
        likedYou,
    }));
}

async function sendMatchDMs(client, userA, userB, subject, duration, mode, reqAId = null, reqBId = null, includeHub = false) {
    // Destination buttons are attached per recipient (each button carries
    // that user's own request id). includeHub=false omits the Study Hub
    // option entirely when no eligible hub exists. No invites are sent here.
    let anyDmSent = false;
    try {
        const dmA = await userA.createDM();
        const payloadA = { content: `🎉 **It's a Match!** You and **${userB.username}** both liked each other for a ${duration}min ${subject} session (${mode}). Say hello!\n\nHow would you like to study together?` };
        if (reqAId != null) payloadA.components = [buildDestinationRow(reqAId, includeHub)];
        await dmA.send(payloadA);
        anyDmSent = true;
    } catch (_) {}
    try {
        const dmB = await userB.createDM();
        const payloadB = { content: `🎉 **It's a Match!** You and **${userA.username}** both liked each other for a ${duration}min ${subject} session (${mode}). Say hello!\n\nHow would you like to study together?` };
        if (reqBId != null) payloadB.components = [buildDestinationRow(reqBId, includeHub)];
        await dmB.send(payloadB);
        anyDmSent = true;
    } catch (_) {}
    return anyDmSent;
}

// Anonymous pending-like notification: reveals compatibility context only.
// Never includes username, user ID, or server of the liker.
function buildPendingLikeDM(prefs) {
    const modeLabel = prefs.mode === 'voice' ? 'Voice' : 'Silent';
    return `💘 **Someone compatible liked you on PomoMatch!**\n\n` +
        `📚 **Subject:** ${prefs.subject}\n` +
        `⏱️ **Duration:** ${prefs.duration} minutes\n` +
        `🎙️ **Mode:** ${modeLabel}\n\n` +
        `Run \`/findbuddy\` to review your compatible candidates — if you like them back, you'll both get matched!`;
}

// Sends the pending-like DM. Returns true on delivery, false otherwise.
// Never throws: DM failure must not break the Like/Match flow.
async function notifyPendingLike(client, targetUserId, prefs) {
    try {
        const user = await client.users.fetch(targetUserId);
        if (!user) return false;
        const dm = await user.createDM();
        await dm.send(buildPendingLikeDM(prefs));
        return true;
    } catch (_) {
        return false;
    }
}

// ─── Study Hub invite flow (Sprint 6G) ─────────────────────────
// Voluntary only: NOTHING here moves users, creates servers, or sends an
// invite without both matched users explicitly accepting first.
// Destination preferences (6F) gate every step; this layer only adds the
// consent + invite mechanics on top of an already-confirmed hub choice.

// Deterministic hub pick: first eligible hub. Temporary by design — a real
// hub-choice UI arrives in a later sprint. Only the hub's public name is
// ever shown to users; never member lists, settings, or IDs.
function pickStudyHub() {
    const hubs = getEligibleStudyHubs();
    if (!hubs || hubs.length === 0) return null;
    return hubs[0];
}

function buildHubConsentRow(myReqId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buddy_hub_accept_${myReqId}`)
            .setLabel('✅ Join Study Hub')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`buddy_hub_decline_${myReqId}`)
            .setLabel('❌ Stay Independent')
            .setStyle(ButtonStyle.Secondary),
    );
}

function buildHubConsentPrompt(hubName, myReqId) {
    return {
        content: `Your match wants to study in a Study Hub.\n\n` +
            `🏫 **Study Hub:** ${hubName}\n\n` +
            `Would you like to join? Nothing happens until you decide — no one is moved automatically.`,
        components: [buildHubConsentRow(myReqId)],
    };
}

// Real-time hub validation, checked live right before invite creation.
// Never trusts cached/database state alone.
async function validateStudyHub(client, hubGuildId) {
    if (!hubGuildId) return { ok: false, reason: 'no_hub' };
    if (!isStudyHubEnabled(hubGuildId)
        || !isStudyHubAcceptingGuests(hubGuildId)
        || !isGlobalBuddyMatchingEnabled(hubGuildId)) {
        return { ok: false, reason: 'disabled' };
    }
    let guild = null;
    try {
        guild = await client.guilds.fetch(hubGuildId);
    } catch (_) {
        guild = null;
    }
    if (!guild) return { ok: false, reason: 'bot_missing' };

    let me = null;
    try {
        me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    } catch (_) {
        me = null;
    }
    if (!me) return { ok: false, reason: 'bot_missing' };

    let channels = null;
    try {
        channels = await guild.channels.fetch();
    } catch (_) {
        channels = null;
    }
    if (!channels) return { ok: false, reason: 'no_channel' };

    const inviteChannel = [...channels.values()]
        .filter(c => c && c.type === ChannelType.GuildText)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .find(c => {
            try {
                return c.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite);
            } catch (_) {
                return false;
            }
        });
    if (!inviteChannel) return { ok: false, reason: 'no_channel' };

    return { ok: true, guild, channel: inviteChannel, name: guild.name || 'Study Hub' };
}

async function dmUser(client, userId, payload) {
    try {
        const user = await client.users.fetch(userId);
        if (!user) return false;
        const dm = await user.createDM();
        await dm.send(payload);
        return true;
    } catch (_) {
        return false;
    }
}

// Shared invite attempt used after both users accepted. Re-validates the
// match, trust state, destination choices, and hub in real time. Never
// throws; returns a result object the caller renders.
async function tryCreateHubInvite(client, matchKey, myReqId, userId) {
    const state = getMatchDestinationState(myReqId, userId);
    if (!state.ok) return { ok: false, reason: 'no_active_match' };
    const partnerId = state.partnerId;
    if (isBuddyBlocked(userId, partnerId) || isBuddyUnmatched(userId, partnerId)) {
        return { ok: false, reason: 'unavailable' };
    }
    if (state.myChoice !== 'study_hub' || state.partnerChoice !== 'study_hub') {
        return { ok: false, reason: 'not_agreed' };
    }

    const hubGuildId = pickStudyHub();
    if (!hubGuildId) return { ok: false, reason: 'no_hub' };

    // Atomic claim: exactly one invite row per match, replays idempotent.
    const claim = claimHubInvite(matchKey, hubGuildId);
    if (!claim.claimed) {
        if (claim.existing && claim.existing.status === 'sent' && claim.existing.invite_url) {
            return { ok: true, replay: true, url: claim.existing.invite_url, hubGuildId: claim.existing.hub_guild_id };
        }
        if (!claim.existing) return { ok: false, reason: 'claim_failed' };
        // Previous attempt failed: fall through and retry with current hub.
    }

    const validation = await validateStudyHub(client, hubGuildId);
    if (!validation.ok) {
        markHubInviteFailed(matchKey);
        return { ok: false, reason: validation.reason };
    }

    // Final match-validity check after all async work: never invite into a dead match.
    const fresh = getMatchDestinationState(myReqId, userId);
    if (!fresh.ok || fresh.myChoice !== 'study_hub' || fresh.partnerChoice !== 'study_hub'
        || isBuddyBlocked(userId, partnerId) || isBuddyUnmatched(userId, partnerId)) {
        markHubInviteFailed(matchKey);
        return { ok: false, reason: 'no_active_match' };
    }

    let invite = null;
    try {
        invite = await validation.channel.createInvite({
            maxAge: 7 * 24 * 3600,
            maxUses: 10,
            unique: true,
            reason: 'PomoMatch Study Hub invite (both users consented)',
        });
    } catch (_) {
        invite = null;
    }
    if (!invite || !invite.url) {
        markHubInviteFailed(matchKey);
        return { ok: false, reason: 'invite_failed' };
    }

    markHubInviteSent(matchKey, invite.url, invite.code || null);

    const inviteText =
        `Both of you agreed! 🎉\n\n` +
        `Here's your Study Hub invitation for **${validation.name}**:\n${invite.url}\n\n` +
        `Joining is completely voluntary — you can keep studying together through DM instead.`;
    await dmUser(client, userId, inviteText);
    await dmUser(client, partnerId, inviteText);

    return { ok: true, url: invite.url, hubGuildId, hubName: validation.name };
}

async function handleBuddyHubConsent(interaction, decision, myReqId) {
    const userId = interaction.user.id;
    if (!swipeLimiter.check(userId)) {
        return interaction.reply({
            content: 'You are tapping too fast. Please wait a bit before continuing.',
            flags: 64,
        });
    }
    if (decision !== 'accept' && decision !== 'decline') {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Choice', 'Please use the buttons above to decide.')],
            flags: 64,
        });
    }
    // Canonicalize once: button values are 'accept'/'decline', stored form
    // is 'accepted'/'declined'. All branches below use the canonical form.
    const canonicalDecision = decision === 'accept' ? 'accepted' : 'declined';

    // Gate 1: my side must be an active match I own.
    const myRow = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(myReqId);
    if (!myRow || myRow.user_id !== userId || myRow.status !== 'matched' || !myRow.matched_user_id) {
        return interaction.reply({
            embeds: [errorEmbed('Match Ended', 'This match is no longer active.')],
            flags: 64,
        });
    }
    const partnerId = myRow.matched_user_id;

    // Gate 2: trust state.
    if (isBuddyBlocked(userId, partnerId) || isBuddyUnmatched(userId, partnerId)) {
        return interaction.reply({
            embeds: [errorEmbed('Unavailable', 'This match is no longer available.')],
            flags: 64,
        });
    }

    // Gate 3: consent is only meaningful after BOTH chose Study Hub.
    const state = getMatchDestinationState(myReqId, userId);
    if (!state.ok || state.myChoice !== 'study_hub' || state.partnerChoice !== 'study_hub') {
        return interaction.reply({
            embeds: [errorEmbed('Not Ready', 'Both of you need to choose Study Hub first. Open your match message to choose.')],
            flags: 64,
        });
    }

    // Gate 4: a hub must currently exist (DB-level; live check happens at invite time).
    if (getEligibleStudyHubs().length === 0) {
        return interaction.reply({
            embeds: [errorEmbed('No Study Hubs', 'There are no eligible Study Hubs right now. You can keep studying together through DM.')],
            flags: 64,
        });
    }

    const matchKey = buddyMatchKey(myReqId, state.partnerRequestId);
    if (!matchKey) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Match', 'This action is no longer valid.')],
            flags: 64,
        });
    }
    recordHubConsent(matchKey, myReqId, userId, canonicalDecision);
    // DMs and the hub invite below can take several Discord calls; acknowledge first
    await interaction.deferUpdate();
    recordBuddyEvent(
        canonicalDecision === 'declined' ? 'buddy_hub_consent_declined' : 'buddy_hub_consent_accepted',
        {
            userId,
            guildId: interaction.guildId,
            requestId: myReqId,
            matchKey,
        }
    );

    if (canonicalDecision === 'declined') {
        await dmUser(interaction.client, partnerId,
            'Your study buddy decided not to join a Study Hub. No problem — you can continue studying together through DM.');
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('Staying independent')
                .setDescription('No problem. You can continue studying together through DM.\n\nYou can change your destination choice anytime while the match is active.')
                .setTimestamp()],
            components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
        });
    }

    // Accepted: check the other side.
    const consents = getHubConsents(matchKey);
    const partnerConsent = consents.find(c => c.user_id === partnerId);
    if (partnerConsent && partnerConsent.decision === 'declined') {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('No invite will be sent')
                .setDescription('Your partner decided not to join a Study Hub. No problem — you can continue studying together through DM.')
                .setTimestamp()],
            components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
        });
    }
    if (!partnerConsent || partnerConsent.decision !== 'accepted') {
        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('Waiting for your partner…')
                .setDescription('You accepted the Study Hub invite. Nothing will be sent until your partner accepts too.\n\nYou can keep studying together through DM in the meantime.')
                .setTimestamp()],
            components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
        });
    }

    // Both accepted → attempt the invite (re-validates everything live).
    const result = await tryCreateHubInvite(interaction.client, matchKey, myReqId, userId);
    if (result.ok && !result.replay) {
        recordBuddyEvent('buddy_hub_invite_sent', {
            userId,
            guildId: interaction.guildId,
            requestId: myReqId,
            matchKey,
        });
        return interaction.editReply({
            embeds: [successEmbed(
                'Invitation sent! 🎉',
                'Your Study Hub invitation was delivered to both of your DMs.\n\nJoining is completely voluntary.'
            )],
            components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
        });
    }
    if (result.ok && result.replay) {
        return interaction.editReply({
            embeds: [successEmbed(
                'Invitation already sent 🎉',
                `Your Study Hub invitation is already in both of your DMs:\n${result.url}`
            )],
            components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
        });
    }

    const reasonText = {
        no_hub: 'There are no eligible Study Hubs right now.',
        disabled: 'The Study Hub is temporarily unavailable (settings changed).',
        bot_missing: 'The Study Hub is temporarily unavailable (bot access changed).',
        no_channel: 'The Study Hub is temporarily unavailable (no suitable channel).',
        invite_failed: 'The Study Hub is temporarily unavailable (invite creation failed).',
        no_active_match: 'This match is no longer active.',
        unavailable: 'This match is no longer available.',
        not_agreed: 'Your destination choices no longer agree.',
        claim_failed: 'Something went wrong. Please try again.',
    }[result.reason] || 'The Study Hub is temporarily unavailable.';
    recordBuddyEvent('buddy_hub_invite_failed', {
        userId,
        guildId: interaction.guildId,
        requestId: myReqId,
        matchKey,
    });
    await dmUser(interaction.client, partnerId,
        `The Study Hub invitation couldn't be completed (${reasonText} Your match stays active — you can keep studying together through DM.`);
    return interaction.editReply({
        embeds: [errorEmbed(
            'Hub temporarily unavailable',
            `${reasonText} Your match stays active — you can keep studying together through DM or try again later.`
        )],
        components: [buildDestinationRow(myReqId, hubsAvailable()), buildTrustRow(myReqId, partnerId)],
    });
}

// ─── Destination selection (Sprint 6F foundation) ──────────────
// Per-user preferences only: recording a choice never moves, invites, or
// redirects anyone. Actual join/invite flow arrives in a later sprint.

const DESTINATION_LABELS = {
    own_server: 'My Server',
    study_hub: 'Study Hub',
    independent: 'Independently',
};

const DESTINATION_EMOJIS = {
    own_server: '🏠',
    study_hub: '🌐',
    independent: '💬',
};

function hubsAvailable() {
    try {
        return getEligibleStudyHubs().length > 0;
    } catch (_) {
        return false;
    }
}

function buildDestinationRow(myReqId, includeHub) {
    const buttons = [
        new ButtonBuilder()
            .setCustomId(`buddy_dest_own_server_${myReqId}`)
            .setLabel('🏠 My Server')
            .setStyle(ButtonStyle.Primary),
    ];
    if (includeHub) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`buddy_dest_study_hub_${myReqId}`)
                .setLabel('🌐 Study Hub')
                .setStyle(ButtonStyle.Primary),
        );
    }
    buttons.push(
        new ButtonBuilder()
            .setCustomId(`buddy_dest_independent_${myReqId}`)
            .setLabel('💬 Independently')
            .setStyle(ButtonStyle.Secondary),
    );
    return new ActionRowBuilder().addComponents(...buttons);
}

function buildTrustRow(myReqId, partnerId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`buddy_unmatch_${myReqId}`)
            .setLabel('💔 End Match')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`buddy_report_${partnerId}_${myReqId}`)
            .setLabel('🚩 Report')
            .setStyle(ButtonStyle.Danger),
    );
}

function destinationStatusEmbed({ myChoice, partnerChoice, confirmed }) {
    if (confirmed) {
        const label = DESTINATION_LABELS[myChoice];
        return successEmbed(
            `Destination confirmed: ${label} 🎉`,
            `You both chose **${label}**.\n\n` +
            `The actual join/invite step arrives in a future update — for now, coordinate in DMs!`
        );
    }
    const label = DESTINATION_LABELS[myChoice];
    const partnerText = partnerChoice && partnerChoice !== 'pending'
        ? `Your partner chose **${DESTINATION_LABELS[partnerChoice]}** — your choices differ, so nothing is confirmed yet.\n`
        : `Waiting for your partner's choice...\n`;
    return new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Your choice recorded')
        .setDescription(
            `Your choice: **${label}**\n` +
            partnerText +
            `\nYou can change your choice anytime while the match is active.`
        )
        .setTimestamp();
}

async function handleBuddyDestination(interaction, choice, myReqId) {
    const userId = interaction.user.id;
    if (!swipeLimiter.check(userId)) {
        return interaction.reply({
            content: 'You are tapping too fast. Please wait a bit before continuing.',
            flags: 64,
        });
    }
    if (choice !== 'own_server' && choice !== 'study_hub' && choice !== 'independent') {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Choice', 'Please pick one of the available options.')],
            flags: 64,
        });
    }

    // Gate 1: my side must be an active match I own.
    const myRow = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(myReqId);
    if (!myRow || myRow.user_id !== userId || myRow.status !== 'matched' || !myRow.matched_user_id) {
        return interaction.reply({
            embeds: [errorEmbed('Match Ended', 'This match is no longer active, so destination selection is closed.')],
            flags: 64,
        });
    }
    const partnerId = myRow.matched_user_id;

    // Gate 2: trust state (block/unmatch ends destination rights).
    if (isBuddyBlocked(userId, partnerId) || isBuddyUnmatched(userId, partnerId)) {
        return interaction.reply({
            embeds: [errorEmbed('Unavailable', 'This match is no longer available.')],
            flags: 64,
        });
    }

    // Gate 3: Study Hub option requires at least one eligible hub right now.
    if (choice === 'study_hub' && !hubsAvailable()) {
        return interaction.reply({
            embeds: [errorEmbed('No Study Hubs', 'There are no eligible Study Hubs right now. Please pick another option.')],
            flags: 64,
        });
    }

    const setRes = setBuddyDestination(myReqId, userId, choice);
    if (!setRes.ok) {
        return interaction.reply({
            embeds: [errorEmbed('Match Ended', 'This match is no longer active, so destination selection is closed.')],
            flags: 64,
        });
    }

    const state = getMatchDestinationState(myReqId, userId);
    const includeHub = hubsAvailable();
    const label = DESTINATION_LABELS[choice];
    const destMatchKey = state.ok ? buddyMatchKey(myReqId, state.partnerRequestId) : null;
    recordBuddyEvent('buddy_destination_selected', {
        userId,
        guildId: interaction.guildId,
        requestId: myReqId,
        matchKey: destMatchKey,
    });
    if (state.ok && state.confirmed) {
        recordBuddyEvent('buddy_destination_confirmed', {
            userId,
            guildId: interaction.guildId,
            requestId: myReqId,
            matchKey: destMatchKey,
        });
    }

    if (!state.ok) {
        // Partner side ended concurrently: acknowledge choice, close selection.
        return interaction.update({
            embeds: [new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('Choice recorded')
                .setDescription(`Your choice: **${label}**\n\nYour partner is no longer in this match, so nothing further will happen.`)
                .setTimestamp()],
            components: [buildTrustRow(myReqId, partnerId)],
        });
    }

    // Any (re-)selection resets hub consent for the whole match: both users
    // must freshly agree again after a change.
    const matchKey = buddyMatchKey(myReqId, state.partnerRequestId);
    if (matchKey) {
        try { clearHubConsents(matchKey); } catch (_) {}
    }

    const hubConfirmed = state.confirmed && state.confirmedChoice === 'study_hub';

    // Notify the partner (best-effort; never breaks the flow).
    const partnerLabel = DESTINATION_EMOJIS[choice] || '';
    try {
        const partnerUser = await interaction.client.users.fetch(partnerId).catch(() => null);
        if (partnerUser) {
            const dm = await partnerUser.createDM();
            if (hubConfirmed) {
                const hubName = await resolveHubDisplayName(interaction.client);
                await dm.send({
                    ...buildHubConsentPrompt(hubName, state.partnerRequestId),
                });
            } else if (state.confirmed) {
                await dm.send(`🎉 Destination confirmed: **${label}** — you both chose it! The actual join/invite step arrives in a future update.`);
            } else {
                await dm.send(`${partnerLabel} Your study buddy chose **${label}**. Open your match message to make your choice.`);
            }
        }
    } catch (_) {}

    if (hubConfirmed) {
        return interaction.update({
            embeds: [new EmbedBuilder()
                .setColor(Colors.SUCCESS)
                .setTitle('Destination confirmed: Study Hub 🎉')
                .setDescription(
                    `You both chose **Study Hub**.\n\n` +
                    `Joining is completely voluntary — decide below. Nothing happens until you both accept.`
                )
                .setTimestamp()],
            components: [
                buildHubConsentRow(myReqId),
                buildDestinationRow(myReqId, includeHub),
                buildTrustRow(myReqId, partnerId),
            ],
        });
    }

    return interaction.update({
        embeds: [destinationStatusEmbed({ myChoice: choice, partnerChoice: state.partnerChoice, confirmed: state.confirmed })],
        components: [buildDestinationRow(myReqId, includeHub), buildTrustRow(myReqId, partnerId)],
    });
}

// Best-effort public hub name for consent prompts. Falls back to a generic
// label when the hub cannot be fetched live; never exposes member lists,
// settings, or IDs.
async function resolveHubDisplayName(client) {
    try {
        const hubId = pickStudyHub();
        if (!hubId) return 'a Study Hub';
        const guild = await client.guilds.fetch(hubId).catch(() => null);
        if (guild && guild.name) return guild.name;
    } catch (_) {}
    return 'a Study Hub';
}

module.exports = {
    cooldown: 5,
    data: new SlashCommandBuilder()
        .setName('findbuddy')
        .setDescription('Find an accountability partner for your study session')
        .addStringOption(opt =>
            opt.setName('subject')
                .setDescription('What are you studying? (e.g., Java, Math, English)')
                .setRequired(true)
                .setMaxLength(60))
        .addIntegerOption(opt =>
            opt.setName('duration')
                .setDescription('Session duration in minutes (5-120)')
                .setRequired(true)
                .setMinValue(5)
                .setMaxValue(120))
        .addStringOption(opt =>
            opt.setName('mode')
                .setDescription('Study mode')
                .setRequired(false)
                .addChoices(
                    { name: '🔇 Silent (text only)', value: 'silent' },
                    { name: '🔊 Voice', value: 'voice' },
                )),

    async execute(interaction) {
        const language = getInteractionLanguage(interaction);
        const userId = interaction.user.id;
        getOrCreateUser(userId);

        await interaction.deferReply({ flags: 64 });

        if (!interaction.guildId) {
            return interaction.editReply({
                embeds: [errorEmbed('Server Only', 'Find Buddy is only available on servers.')],
            });
        }

        const subject = interaction.options.getString('subject');
        const duration = interaction.options.getInteger('duration');
        const mode = interaction.options.getString('mode') || 'silent';
        const prefs = { subject, duration, mode };

        // 0. Expire stale requests so the queue never serves ghosts
        try { expireStaleBuddyRequests(); } catch (_) {}

        // 0b. Don't queue users who are already in an active study session
        if (getActiveSessionForUser(userId)) {
            return interaction.editReply({
                embeds: [errorEmbed(
                    'Already In Session',
                    'You already have an active study session. Finish or cancel it with `/cancel` before finding a buddy.'
                )],
            });
        }

        // 0c. Abuse protection: cap new requests per hour (generous)
        try {
            if (countRecentBuddyRequests(userId, 60) >= BUDDY_REQUESTS_PER_HOUR) {
                return interaction.editReply({
                    embeds: [errorEmbed(
                        'Slow Down',
                        'You have created a lot of buddy requests recently. Please wait a bit before trying again.'
                    )],
                });
            }
        } catch (_) {}

        // 1. Cancel any existing waiting request (one active request per user)
        db.prepare("UPDATE buddy_requests SET status = 'cancelled', ended_at = datetime('now') WHERE user_id = ? AND status = 'waiting'").run(userId);

        // 2. Create a request (guild_id kept for origin tracking; matching is global)
        const reqResult = createBuddyRequest(userId, interaction.guildId, subject, duration, mode);
        const myRequestId = Number(reqResult.lastInsertRowid);
        recordBuddyEvent('buddy_request_created', {
            userId,
            guildId: interaction.guildId,
            requestId: myRequestId,
        });

        // 3. Find best candidate (local-first, then global) — show card, don't auto-match
        const excludeUserIds = new Set(getBuddyActedUserIds(userId));
        const { candidate, score } = findBestCandidate({
            userId,
            myRequestId,
            prefs,
            guildId: interaction.guildId,
            excludeUserIds,
        });

        if (!candidate || score < MATCH_THRESHOLD) {
            const waitingEmbed = new EmbedBuilder()
                .setColor(Colors.INFO)
                .setTitle('🔎 Finding your study partner...')
                .setDescription(
                    `Your request is active for **30 minutes**. You will see compatible people here as they appear.\n\n` +
                    `**Waiting for:**\n` +
                    `📚 **Subject:** ${subject}\n` +
                    `⏱️ **Duration:** ${duration} minutes\n` +
                    `🎙️ **Mode:** ${mode === 'voice' ? 'Voice' : 'Silent'}\n\n` +
                    `Tip: Share this with friends so they can search with similar settings!`
                );

            const cancelRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`buddy_cancel_${myRequestId}`)
                    .setLabel('Cancel Request')
                    .setStyle(ButtonStyle.Danger)
            );

            return interaction.editReply({ embeds: [waitingEmbed], components: [cancelRow] });
        }

        const likedYou = hasBuddyLiked(candidate.user_id, userId);
        recordBuddyEvent('buddy_candidate_shown', {
            userId,
            guildId: interaction.guildId,
            requestId: myRequestId,
            scope: buddyEventScope(interaction.guildId, candidate.guild_id),
        });
        return interaction.editReply(candidateCardPayload({
            candidate,
            prefs,
            score,
            myRequestId,
            guildId: interaction.guildId,
            likedYou,
        }));
    },
};

async function handleBuddyLike(interaction, candReqId, myReqId) {
    const userId = interaction.user.id;
    if (!swipeLimiter.check(userId)) {
        return interaction.reply({
            content: 'You are tapping too fast. Please wait a bit before continuing.',
            flags: 64,
        });
    }
    try { expireStaleBuddyRequests(); } catch (_) {}

    const myReq = getMyWaitingRequest(myReqId, userId);
    if (!myReq) {
        return interaction.update({
            embeds: [errorEmbed('Request Expired', 'Your buddy request is no longer active. Run `/findbuddy` again to keep looking.')],
            components: [],
        });
    }

    const candReq = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(candReqId);
    if (!candReq || !isRequestFresh(candReq) || candReq.user_id === userId) {
        await advanceQueue(interaction, userId, myReqId);
        return interaction.followUp({
            content: 'That person is no longer looking. Showing the next candidate.',
            flags: 64,
        });
    }

    const candUserId = candReq.user_id;
    if (isBuddyBlocked(userId, candUserId) || getActiveSessionForUser(candUserId) || getActiveSessionForUser(userId)) {
        await advanceQueue(interaction, userId, myReqId);
        return interaction.followUp({
            content: 'That person is no longer available. Showing the next candidate.',
            flags: 64,
        });
    }

    // Persistent Like (duplicates ignored)
    const { created: isNewLike } = recordBuddySwipe(userId, candUserId, candReqId, 'like');
    if (isNewLike) {
        recordBuddyEvent('buddy_like', {
            userId,
            guildId: interaction.guildId,
            requestId: myReqId,
            scope: buddyEventScope(interaction.guildId, candReq.guild_id),
        });
    }

    // Mutual? They must have liked me back.
    if (!hasBuddyLiked(candUserId, userId)) {
        await advanceQueue(interaction, userId, myReqId);
        await interaction.followUp({
            content: '❤️ Liked! If they like you back, you will both get a DM.',
            flags: 64,
        });
        // One-time anonymous pending notification. Never breaks the flow
        // (notifyPendingLike never throws) and never delays the interaction
        // response (update + followUp already sent above).
        // Only for genuinely new likes: duplicates (created=false) never re-notify.
        if (isNewLike) {
            const likerPrefs = { subject: myReq.subject, duration: myReq.duration, mode: myReq.mode || 'silent' };
            await notifyPendingLike(interaction.client, candUserId, likerPrefs);
        }
        return;
    }

    // Re-validate on current requests and recompute compatibility
    const myCurrent = getMyWaitingRequest(myReqId, userId);
    const candCurrent = db.prepare('SELECT * FROM buddy_requests WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
        .get(candUserId, 'waiting');
    if (!myCurrent || !candCurrent || !isRequestFresh(candCurrent)) {
        await advanceQueue(interaction, userId, myReqId);
        return interaction.followUp({
            content: 'They just left the queue. Showing the next candidate.',
            flags: 64,
        });
    }

    const prefs = { subject: myCurrent.subject, duration: myCurrent.duration, mode: myCurrent.mode || 'silent' };
    const score = scoreBuddyMatch(candCurrent, prefs);
    if (score < MATCH_THRESHOLD || !isCandidateEligible(candCurrent, userId)) {
        await advanceQueue(interaction, userId, myReqId);
        return interaction.followUp({
            content: 'No longer compatible. Showing the next candidate.',
            flags: 64,
        });
    }

    const matched = matchBuddyPair(myCurrent.id, candUserId, candCurrent.id, userId, score);
    if (matched !== 2) {
        await advanceQueue(interaction, userId, myReqId);
        return interaction.followUp({
            content: 'They just left the queue. Showing the next candidate.',
            flags: 64,
        });
    }

    recordBuddyEvent('buddy_match_created', {
        userId,
        guildId: interaction.guildId,
        requestId: myCurrent.id,
        matchKey: buddyMatchKey(myCurrent.id, candCurrent.id),
        scope: buddyEventScope(myCurrent.guild_id, candCurrent.guild_id),
    });

    const partnerUser = await interaction.client.users.fetch(candUserId).catch(() => null);
    const includeHub = hubsAvailable();
    const trustRow = buildTrustRow(myCurrent.id, candUserId);
    await interaction.update({
        embeds: [successEmbed(
            '🎉 It\'s a Match!',
            `You and **${partnerUser?.username || 'your study buddy'}** both liked each other!\n\n` +
            `📚 **Subject:** ${prefs.subject}\n` +
            `⏱️ **Duration:** ${prefs.duration} minutes\n` +
            `🎙️ **Mode:** ${prefs.mode === 'voice' ? 'Voice' : 'Silent'}\n\n` +
            `Check your DMs to say hello!\n\n` +
            `**How would you like to study together?** Pick below — nothing moves until you both agree.`
        )],
        components: [buildDestinationRow(myCurrent.id, includeHub), trustRow],
    });

    if (partnerUser) {
        const sent = await sendMatchDMs(interaction.client, interaction.user, partnerUser, prefs.subject, prefs.duration, prefs.mode, myCurrent.id, candCurrent.id, includeHub);
        if (!sent) {
            await interaction.followUp({
                content: '⚠️ Could not send DMs. Check your privacy settings.',
                flags: 64,
            });
        }
    }
}

async function handleBuddyPass(interaction, candReqId, myReqId) {
    const userId = interaction.user.id;
    if (!swipeLimiter.check(userId)) {
        return interaction.reply({
            content: 'You are tapping too fast. Please wait a bit before continuing.',
            flags: 64,
        });
    }
    try { expireStaleBuddyRequests(); } catch (_) {}

    const myReq = getMyWaitingRequest(myReqId, userId);
    if (!myReq) {
        return interaction.update({
            embeds: [errorEmbed('Request Expired', 'Your buddy request is no longer active. Run `/findbuddy` again to keep looking.')],
            components: [],
        });
    }

    const candReq = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(candReqId);
    if (candReq && candReq.user_id && candReq.user_id !== userId && !isBuddyBlocked(userId, candReq.user_id)) {
        const { created } = recordBuddySwipe(userId, candReq.user_id, candReqId, 'pass');
        if (created) {
            recordBuddyEvent('buddy_pass', {
                userId,
                guildId: interaction.guildId,
                requestId: myReqId,
                scope: buddyEventScope(interaction.guildId, candReq.guild_id),
            });
        }
    }

    await advanceQueue(interaction, userId, myReqId);
}

async function handleBuddyBlock(interaction, candReqId, myReqId) {
    const userId = interaction.user.id;

    const myReq = getMyWaitingRequest(myReqId, userId);
    if (!myReq) {
        return interaction.update({
            embeds: [errorEmbed('Request Expired', 'Your buddy request is no longer active. Run `/findbuddy` again to keep looking.')],
            components: [],
        });
    }

    // Resolve the target server-side from the candidate request so user IDs
    // never travel inside button payloads.
    const candReq = db.prepare('SELECT * FROM buddy_requests WHERE id = ?').get(candReqId);
    if (candReq && candReq.user_id && candReq.user_id !== userId) {
        const { created } = blockBuddyUser(userId, candReq.user_id);
        if (created) {
            recordBuddyEvent('buddy_block', {
                userId,
                guildId: interaction.guildId,
                requestId: myReqId,
                scope: buddyEventScope(interaction.guildId, candReq.guild_id),
            });
        }
    }
    await advanceQueue(interaction, userId, myReqId);
    return interaction.followUp({
        content: '🚫 Blocked. You will not be matched with them again.',
        flags: 64,
    });
}

// Shared unmatch core used by the End Match button and the /unmatch command.
// Ends the match, preserves history rows, blocks future re-matching, and
// notifies the partner without exposing who ended it.
async function doUnmatch(client, userId, requestId = null) {
    const res = unmatchBuddyPair(userId, requestId);
    if (!res.ok) return res;
    try {
        const row = res.myRequestId
            ? db.prepare('SELECT guild_id FROM buddy_requests WHERE id = ?').get(res.myRequestId)
            : null;
        recordBuddyEvent('buddy_unmatch', {
            userId,
            guildId: row?.guild_id || null,
            requestId: res.myRequestId || null,
            matchKey: (res.myRequestId && res.partnerRequestId)
                ? buddyMatchKey(res.myRequestId, res.partnerRequestId)
                : null,
        });
    } catch (_) {}
    try {
        const partner = await client.users.fetch(res.partnerId);
        if (partner) {
            const dm = await partner.createDM();
            await dm.send('Your PomoMatch study partnership has ended. You won\'t be matched with each other again.');
        }
    } catch (_) {}
    return res;
}

async function handleBuddyUnmatch(interaction, myReqId) {
    const userId = interaction.user.id;
    if (!unmatchLimiter.check(userId)) {
        return interaction.reply({
            content: 'You are doing that too often. Please wait a bit before trying again.',
            flags: 64,
        });
    }

    const res = await doUnmatch(interaction.client, userId, myReqId);
    if (!res.ok) {
        return interaction.reply({
            embeds: [errorEmbed('No Active Match', 'You have no active match to end.')],
            flags: 64,
        });
    }

    return interaction.update({
        embeds: [successEmbed(
            'Match Ended',
            'Your study partnership has ended. You won\'t be matched with each other again.'
        )],
        components: [],
    });
}

async function handleBuddyReportButton(interaction, partnerId, myReqId) {
    const userId = interaction.user.id;
    if (!partnerId || partnerId === userId) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Report', 'This report action is no longer valid.')],
            flags: 64,
        });
    }
    if (!hasBuddyMatchHistory(userId, partnerId)) {
        return interaction.reply({
            embeds: [errorEmbed('Not Allowed', 'You can only report someone you have matched with.')],
            flags: 64,
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`buddy_report_modal_${partnerId}_${myReqId}`)
        .setTitle('Report Study Buddy');

    const reasonInput = new TextInputBuilder()
        .setCustomId('buddy_report_reason')
        .setLabel('Report reason')
        .setPlaceholder('harassment, spam, inappropriate, fake, other')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(60);

    const detailsInput = new TextInputBuilder()
        .setCustomId('buddy_report_details')
        .setLabel('Details (optional)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500);

    modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput),
        new ActionRowBuilder().addComponents(detailsInput),
    );

    return interaction.showModal(modal);
}

const REPORT_ERROR_MESSAGES = {
    invalid_reason: 'Please use one of: harassment, spam, inappropriate, fake, other.',
    self_report: 'You cannot report yourself.',
    no_match_history: 'You can only report someone you have matched with.',
    duplicate_open: 'You already have an open report for this user.',
    rate_limited: 'You have filed a lot of reports recently. Please wait a day before reporting again.',
};

async function handleBuddyReportSubmit(interaction) {
    const userId = interaction.user.id;
    // Parse from the end: IDs may legally contain underscores in tests and
    // future formats; request IDs are always the trailing numeric segment.
    const parts = String(interaction.customId || '').split('_');
    const myReqId = parseInt(parts[parts.length - 1], 10);
    const partnerId = parts.slice(3, -1).join('_');
    if (!partnerId || partnerId === userId || Number.isNaN(myReqId)) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Report', 'This report action is no longer valid.')],
            flags: 64,
        });
    }

    const rawReason = interaction.fields.getTextInputValue('buddy_report_reason');
    const details = interaction.fields.getTextInputValue('buddy_report_details');
    const normalized = normalizeBuddyReportReason(rawReason);
    if (!normalized) {
        return interaction.reply({
            embeds: [errorEmbed('Invalid Reason', REPORT_ERROR_MESSAGES.invalid_reason)],
            flags: 64,
        });
    }

    const res = createBuddyReport({
        reporterId: userId,
        reportedId: partnerId,
        requestId: myReqId,
        reason: normalized,
        description: details,
    });

    if (!res.ok) {
        return interaction.reply({
            embeds: [errorEmbed('Report Not Filed', REPORT_ERROR_MESSAGES[res.reason] || 'Could not file this report.')],
            flags: 64,
        });
    }

    recordBuddyEvent('buddy_report', {
        userId,
        guildId: interaction.guildId,
        requestId: myReqId,
    });

    return interaction.reply({
        embeds: [successEmbed(
            'Report Received',
            'Thanks — our team will review this report. You can use Block if you never want to be matched with them again.'
        )],
        flags: 64,
    });
}

module.exports.checkUnmatchRateLimit = (userId) => unmatchLimiter.check(userId);
module.exports.scoreBuddyMatch = scoreBuddyMatch;
module.exports.isCandidateEligible = isCandidateEligible;
module.exports.findBestCandidate = findBestCandidate;
module.exports.candidateCardPayload = candidateCardPayload;
module.exports.createRateLimiter = createRateLimiter;
module.exports.handleBuddyLike = handleBuddyLike;
module.exports.handleBuddyPass = handleBuddyPass;
module.exports.handleBuddyBlock = handleBuddyBlock;
module.exports.handleBuddyUnmatch = handleBuddyUnmatch;
module.exports.handleBuddyDestination = handleBuddyDestination;
module.exports.handleBuddyHubConsent = handleBuddyHubConsent;
module.exports.buildDestinationRow = buildDestinationRow;
module.exports.buildTrustRow = buildTrustRow;
module.exports.buildHubConsentRow = buildHubConsentRow;
module.exports.buildHubConsentPrompt = buildHubConsentPrompt;
module.exports.pickStudyHub = pickStudyHub;
module.exports.validateStudyHub = validateStudyHub;
module.exports.tryCreateHubInvite = tryCreateHubInvite;
module.exports.handleBuddyReportButton = handleBuddyReportButton;
module.exports.handleBuddyReportSubmit = handleBuddyReportSubmit;
module.exports.doUnmatch = doUnmatch;
module.exports.buildPendingLikeDM = buildPendingLikeDM;
module.exports.notifyPendingLike = notifyPendingLike;
