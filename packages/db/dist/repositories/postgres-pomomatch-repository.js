"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresPomoMatchRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pomomatch_1 = require("../schema/pomomatch");
const guilds_1 = require("../schema/guilds");
class PostgresPomoMatchRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapRequest(row) {
        return {
            id: String(row.id),
            user_id: row.user_id,
            guild_id: row.guild_id,
            subject: row.subject || null,
            duration: row.duration || null,
            mode: row.mode || 'silent',
            created_at: row.created_at,
            status: row.status,
            matched_user_id: row.matched_user_id || null,
            match_score: row.match_score || null,
            session_channel_id: row.session_channel_id || null,
            destination: row.destination || 'pending',
            ended_at: row.ended_at || null
        };
    }
    createBuddyRequest(data, ctx) {
        throw new Error('Use async createBuddyRequestAsync for PostgreSQL');
    }
    async createBuddyRequestAsync(data, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(pomomatch_1.buddy_requests).values({
            user_id: data.userId,
            guild_id: data.guildId,
            subject: data.subject,
            duration: data.duration,
            mode: data.mode || 'silent',
            status: 'waiting'
        }).returning();
        return this.mapRequest(result[0]);
    }
    getLatestWaitingBuddyRequestForUser(userId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getLatestWaitingBuddyRequestForUserAsync(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'waiting')))
            .orderBy((0, drizzle_orm_1.sql) `${pomomatch_1.buddy_requests.created_at} DESC`)
            .limit(1);
        return result.length > 0 ? this.mapRequest(result[0]) : null;
    }
    cancelWaitingBuddyRequest(requestId, userId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async cancelWaitingBuddyRequestAsync(requestId, userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'cancelled', ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'waiting')))
            .returning({ id: pomomatch_1.buddy_requests.id });
        return result.length > 0;
    }
    getWaitingBuddyRequests(guildId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getWaitingBuddyRequestsAsync(guildId, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.guild_id, guildId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'waiting')));
        return rows.map((r) => this.mapRequest(r));
    }
    getGlobalWaitingBuddyRequests(ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getGlobalWaitingBuddyRequestsAsync(ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(pomomatch_1.buddy_requests).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'waiting'));
        return rows.map((r) => this.mapRequest(r));
    }
    expireStaleBuddyRequests(ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async expireStaleBuddyRequestsAsync(ctx) {
        const dbClient = ctx?.db || this.db;
        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        const result = await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'expired', ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'waiting'), (0, drizzle_orm_1.lt)(pomomatch_1.buddy_requests.created_at, cutoff)))
            .returning({ id: pomomatch_1.buddy_requests.id });
        return result.length;
    }
    matchBuddyPair(requestId1, matchedUser1Id, requestId2, matchedUser2Id, matchScore, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async matchBuddyPairAsync(requestId1, matchedUser1Id, requestId2, matchedUser2Id, matchScore, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUser2Id, match_score: matchScore, ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId1));
        await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUser1Id, match_score: matchScore, ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId2));
        return true;
    }
    unmatchBuddyPair(userId, requestId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async unmatchBuddyPairAsync(userId, requestId, ctx) {
        const dbClient = ctx?.db || this.db;
        let myRequest = null;
        if (requestId) {
            const rows = await dbClient.select().from(pomomatch_1.buddy_requests).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId)).limit(1);
            myRequest = rows[0] || null;
        }
        else {
            const rows = await dbClient.select().from(pomomatch_1.buddy_requests)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'matched')))
                .orderBy((0, drizzle_orm_1.sql) `${pomomatch_1.buddy_requests.ended_at} DESC`).limit(1);
            myRequest = rows[0] || null;
        }
        if (!myRequest)
            return { ok: false, reason: 'no_match_found' };
        const partnerId = myRequest.matched_user_id;
        await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'unmatched', ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, myRequest.id));
        // Find partner request
        const partnerRows = await dbClient.select().from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, partnerId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.matched_user_id, userId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.status, 'matched')))
            .limit(1);
        const partnerRequest = partnerRows[0] || null;
        if (partnerRequest) {
            await dbClient.update(pomomatch_1.buddy_requests)
                .set({ status: 'unmatched', ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
                .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, partnerRequest.id));
        }
        // Record unmatch
        await dbClient.insert(pomomatch_1.buddy_unmatches)
            .values({ unmatcher_id: userId, unmatched_id: partnerId })
            .onConflictDoNothing();
        return {
            ok: true,
            partnerId,
            myRequestId: myRequest.id,
            partnerRequestId: partnerRequest?.id || null
        };
    }
    matchBuddyRequest(requestId, matchedUserId, matchScore, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async matchBuddyRequestAsync(requestId, matchedUserId, matchScore, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUserId, match_score: matchScore, ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId))
            .returning({ id: pomomatch_1.buddy_requests.id });
        return result.length > 0;
    }
    endBuddyRequest(requestId, status = 'ended', ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async endBuddyRequestAsync(requestId, status = 'ended', ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_requests)
            .set({ status, ended_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId))
            .returning({ id: pomomatch_1.buddy_requests.id });
        return result.length > 0;
    }
    setBuddyDestination(requestId, userId, choice, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async setBuddyDestinationAsync(requestId, userId, choice, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_requests)
            .set({ destination: choice })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, requestId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userId)))
            .returning({ id: pomomatch_1.buddy_requests.id });
        if (result.length === 0)
            return { ok: false, reason: 'not_found' };
        return { ok: true, choice };
    }
    getMatchDestinationState(myRequestId, userId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getMatchDestinationStateAsync(myRequestId, userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const myRow = await dbClient.select().from(pomomatch_1.buddy_requests).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.id, myRequestId)).limit(1);
        if (!myRow[0])
            return { ok: false, reason: 'not_found' };
        const partnerRows = await dbClient.select().from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, myRow[0].matched_user_id), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.matched_user_id, userId)))
            .limit(1);
        const partner = partnerRows[0] || null;
        const myChoice = myRow[0].destination;
        const partnerChoice = partner?.destination || null;
        const confirmed = myChoice && partnerChoice && myChoice !== 'pending' && partnerChoice !== 'pending';
        return {
            ok: true,
            myChoice,
            partnerChoice,
            partnerId: myRow[0].matched_user_id,
            partnerRequestId: partner?.id,
            confirmed: Boolean(confirmed),
            confirmedChoice: confirmed ? myChoice : null
        };
    }
    recordHubConsent(matchKey, requestId, userId, decision, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async recordHubConsentAsync(matchKey, requestId, userId, decision, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select().from(pomomatch_1.buddy_hub_consents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.match_key, matchKey), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.user_id, userId)))
            .limit(1);
        if (existing.length > 0 && existing[0].decision === decision) {
            return { ok: true, changed: false };
        }
        await dbClient.insert(pomomatch_1.buddy_hub_consents)
            .values({ match_key: matchKey, request_id: requestId, user_id: userId, decision })
            .onConflictDoUpdate({
            target: [pomomatch_1.buddy_hub_consents.match_key, pomomatch_1.buddy_hub_consents.user_id],
            set: { decision, updated_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` }
        });
        return { ok: true, changed: true };
    }
    getHubConsents(matchKey, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getHubConsentsAsync(matchKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(pomomatch_1.buddy_hub_consents).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.match_key, matchKey));
        return rows.map((r) => ({
            id: r.id, match_key: r.match_key, request_id: r.request_id, user_id: r.user_id,
            decision: r.decision, created_at: r.created_at, updated_at: r.updated_at
        }));
    }
    clearHubConsents(matchKey, userId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async clearHubConsentsAsync(matchKey, userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const where = userId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.match_key, matchKey), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.user_id, userId))
            : (0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_consents.match_key, matchKey);
        const result = await dbClient.delete(pomomatch_1.buddy_hub_consents).where(where).returning({ id: pomomatch_1.buddy_hub_consents.id });
        return result.length;
    }
    claimHubInvite(matchKey, hubGuildId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async claimHubInviteAsync(matchKey, hubGuildId, ctx) {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select().from(pomomatch_1.buddy_hub_invites).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_invites.match_key, matchKey)).limit(1);
        if (existing.length > 0) {
            return { claimed: false, isNew: false, existing: existing[0] };
        }
        const result = await dbClient.insert(pomomatch_1.buddy_hub_invites)
            .values({ match_key: matchKey, hub_guild_id: hubGuildId, status: 'pending' })
            .returning();
        return { claimed: true, isNew: true, row: result[0] };
    }
    getHubInvite(matchKey, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getHubInviteAsync(matchKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(pomomatch_1.buddy_hub_invites).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_invites.match_key, matchKey)).limit(1);
        return result.length > 0 ? result[0] : null;
    }
    markHubInviteSent(matchKey, url, code, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async markHubInviteSentAsync(matchKey, url, code, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_hub_invites)
            .set({ status: 'sent', invite_url: url, invite_code: code, sent_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_invites.match_key, matchKey))
            .returning({ id: pomomatch_1.buddy_hub_invites.id });
        return result.length > 0;
    }
    markHubInviteFailed(matchKey, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async markHubInviteFailedAsync(matchKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(pomomatch_1.buddy_hub_invites)
            .set({ status: 'failed' })
            .where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_hub_invites.match_key, matchKey))
            .returning({ id: pomomatch_1.buddy_hub_invites.id });
        return result.length > 0;
    }
    isGlobalBuddyMatchingEnabled(guildId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async isGlobalBuddyMatchingEnabledAsync(guildId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guilds_1.guild_settings.global_buddy_matching_enabled })
            .from(guilds_1.guild_settings).where((0, drizzle_orm_1.eq)(guilds_1.guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }
    isStudyHubEnabled(guildId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async isStudyHubEnabledAsync(guildId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guilds_1.guild_settings.study_hub_enabled })
            .from(guilds_1.guild_settings).where((0, drizzle_orm_1.eq)(guilds_1.guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }
    isStudyHubAcceptingGuests(guildId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async isStudyHubAcceptingGuestsAsync(guildId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guilds_1.guild_settings.study_hub_accepts_guests })
            .from(guilds_1.guild_settings).where((0, drizzle_orm_1.eq)(guilds_1.guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }
    getEligibleStudyHubs(ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getEligibleStudyHubsAsync(ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select({ guild_id: guilds_1.guild_settings.guild_id })
            .from(guilds_1.guild_settings)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(guilds_1.guild_settings.study_hub_enabled, true), (0, drizzle_orm_1.eq)(guilds_1.guild_settings.study_hub_accepts_guests, true)));
        return rows.map((r) => r.guild_id);
    }
    isBuddyBlocked(userA, userB, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async isBuddyBlockedAsync(userA, userB, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: pomomatch_1.buddy_blocks.blocker_id }).from(pomomatch_1.buddy_blocks)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_blocks.blocker_id, userA), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_blocks.blocked_id, userB)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_blocks.blocker_id, userB), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_blocks.blocked_id, userA))))
            .limit(1);
        return result.length > 0;
    }
    blockBuddyUser(blockerId, blockedId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async blockBuddyUserAsync(blockerId, blockedId, ctx) {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(pomomatch_1.buddy_blocks).values({ blocker_id: blockerId, blocked_id: blockedId }).onConflictDoNothing();
            return true;
        }
        catch {
            return false;
        }
    }
    isBuddyUnmatched(userA, userB, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async isBuddyUnmatchedAsync(userA, userB, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: pomomatch_1.buddy_unmatches.unmatcher_id }).from(pomomatch_1.buddy_unmatches)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_unmatches.unmatcher_id, userA), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_unmatches.unmatched_id, userB)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_unmatches.unmatcher_id, userB), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_unmatches.unmatched_id, userA))))
            .limit(1);
        return result.length > 0;
    }
    hasBuddyMatchHistory(userA, userB, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async hasBuddyMatchHistoryAsync(userA, userB, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: pomomatch_1.buddy_requests.id }).from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.or)((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userA), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.matched_user_id, userB)), (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userB), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.matched_user_id, userA))))
            .limit(1);
        return result.length > 0;
    }
    createBuddyReport(data, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async createBuddyReportAsync(data, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(pomomatch_1.buddy_reports).values({
            reporter_user_id: data.reporterId,
            reported_user_id: data.reportedId,
            request_id: data.requestId ? String(data.requestId) : null,
            reason: data.reason,
            description: data.description || null
        }).returning({ id: pomomatch_1.buddy_reports.id });
        return { ok: true, reason: 'created', id: result[0].id };
    }
    countBuddyReportsToday(reporterId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async countBuddyReportsTodayAsync(reporterId, ctx) {
        const dbClient = ctx?.db || this.db;
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const result = await dbClient.select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` }).from(pomomatch_1.buddy_reports)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_reports.reporter_user_id, reporterId), (0, drizzle_orm_1.sql) `${pomomatch_1.buddy_reports.created_at} >= ${dayStart.toISOString()}`));
        return Number(result[0]?.count || 0);
    }
    countRecentBuddyRequests(userId, minutes, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async countRecentBuddyRequestsAsync(userId, minutes, ctx) {
        const dbClient = ctx?.db || this.db;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const result = await dbClient.select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` }).from(pomomatch_1.buddy_requests)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_requests.user_id, userId), (0, drizzle_orm_1.sql) `${pomomatch_1.buddy_requests.created_at} >= ${cutoff}`));
        return Number(result[0]?.count || 0);
    }
    recordBuddySwipe(swiperId, targetUserId, targetRequestId, action, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async recordBuddySwipeAsync(swiperId, targetUserId, targetRequestId, action, ctx) {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(pomomatch_1.buddy_swipes)
                .values({ swiper_id: swiperId, target_user_id: targetUserId, target_request_id: targetRequestId, action })
                .onConflictDoNothing();
            return true;
        }
        catch {
            return false;
        }
    }
    hasBuddyLiked(likerId, likedUserId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async hasBuddyLikedAsync(likerId, likedUserId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: pomomatch_1.buddy_swipes.id }).from(pomomatch_1.buddy_swipes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_swipes.swiper_id, likerId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_swipes.target_user_id, likedUserId), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_swipes.action, 'like')))
            .limit(1);
        return result.length > 0;
    }
    getBuddyActedUserIds(swiperId, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getBuddyActedUserIdsAsync(swiperId, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select({ target_user_id: pomomatch_1.buddy_swipes.target_user_id })
            .from(pomomatch_1.buddy_swipes).where((0, drizzle_orm_1.eq)(pomomatch_1.buddy_swipes.swiper_id, swiperId));
        return rows.map((r) => r.target_user_id);
    }
    buddyMatchScope(matchKey, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async buddyMatchScopeAsync(matchKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ scope: pomomatch_1.buddy_analytics_events.scope })
            .from(pomomatch_1.buddy_analytics_events)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pomomatch_1.buddy_analytics_events.match_key, matchKey), (0, drizzle_orm_1.eq)(pomomatch_1.buddy_analytics_events.event_name, 'match_formed')))
            .limit(1);
        const scope = result[0]?.scope;
        return (scope === 'local' || scope === 'global') ? scope : null;
    }
    recordBuddyEvent(eventName, fields, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async recordBuddyEventAsync(eventName, fields, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(pomomatch_1.buddy_analytics_events).values({
            event_name: eventName,
            user_id: fields?.userId || null,
            guild_id: fields?.guildId || null,
            request_id: fields?.requestId ? String(fields.requestId) : null,
            match_key: fields?.matchKey || null,
            scope: fields?.scope || null
        });
        return true;
    }
    getBuddyFunnelStats(options, ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getBuddyFunnelStatsAsync(options, ctx) {
        const dbClient = ctx?.db || this.db;
        const days = options?.days || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const rows = await dbClient.select({
            event_name: pomomatch_1.buddy_analytics_events.event_name,
            count: (0, drizzle_orm_1.sql) `COUNT(*)`
        })
            .from(pomomatch_1.buddy_analytics_events)
            .where((0, drizzle_orm_1.sql) `${pomomatch_1.buddy_analytics_events.created_at} >= ${cutoff}`)
            .groupBy(pomomatch_1.buddy_analytics_events.event_name);
        const stats = {};
        for (const row of rows) {
            stats[row.event_name] = Number(row.count);
        }
        return stats;
    }
}
exports.PostgresPomoMatchRepository = PostgresPomoMatchRepository;
