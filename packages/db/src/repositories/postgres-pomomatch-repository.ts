import {
    PomoMatchRepository, CreateBuddyRequestInput, BuddyRequest, BuddyHubConsent, BuddyHubInvite,
    UnmatchResult, DestinationStateResult, SetDestinationResult, ClaimHubInviteResult,
    CreateBuddyReportInput, CreateBuddyReportResult, BuddyFunnelStatsInput
} from './pomomatch-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, or, ne, sql, lt } from 'drizzle-orm';
import {
    buddy_requests, buddy_swipes, buddy_blocks, buddy_unmatches,
    buddy_reports, buddy_hub_consents, buddy_hub_invites, buddy_analytics_events
} from '../schema/pomomatch';
import { guild_settings } from '../schema/guilds';

export class PostgresPomoMatchRepository implements PomoMatchRepository {
    constructor(private db: any) {}

    private mapRequest(row: any): BuddyRequest {
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

    createBuddyRequest(data: CreateBuddyRequestInput, ctx?: TransactionContext): { lastInsertRowid: number | bigint, changes: number } {
        throw new Error('Use async createBuddyRequestAsync for PostgreSQL');
    }

    async createBuddyRequestAsync(data: CreateBuddyRequestInput, ctx?: TransactionContext): Promise<BuddyRequest> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(buddy_requests).values({
            user_id: data.userId,
            guild_id: data.guildId,
            subject: data.subject,
            duration: data.duration,
            mode: data.mode || 'silent',
            status: 'waiting'
        }).returning();
        return this.mapRequest(result[0]);
    }

    getLatestWaitingBuddyRequestForUser(userId: string, ctx?: TransactionContext): BuddyRequest | null {
        throw new Error('Use async version for PostgreSQL');
    }

    async getLatestWaitingBuddyRequestForUserAsync(userId: string, ctx?: TransactionContext): Promise<BuddyRequest | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(buddy_requests)
            .where(and(eq(buddy_requests.user_id, userId), eq(buddy_requests.status, 'waiting')))
            .orderBy(sql`${buddy_requests.created_at} DESC`)
            .limit(1);
        return result.length > 0 ? this.mapRequest(result[0]) : null;
    }

    cancelWaitingBuddyRequest(requestId: number, userId: string, ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async cancelWaitingBuddyRequestAsync(requestId: string, userId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_requests)
            .set({ status: 'cancelled', ended_at: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(buddy_requests.id, requestId), eq(buddy_requests.user_id, userId), eq(buddy_requests.status, 'waiting')))
            .returning({ id: buddy_requests.id });
        return result.length > 0;
    }

    getWaitingBuddyRequests(guildId: string, ctx?: TransactionContext): BuddyRequest[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getWaitingBuddyRequestsAsync(guildId: string, ctx?: TransactionContext): Promise<BuddyRequest[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(buddy_requests)
            .where(and(eq(buddy_requests.guild_id, guildId), eq(buddy_requests.status, 'waiting')));
        return rows.map((r: any) => this.mapRequest(r));
    }

    getGlobalWaitingBuddyRequests(ctx?: TransactionContext): BuddyRequest[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getGlobalWaitingBuddyRequestsAsync(ctx?: TransactionContext): Promise<BuddyRequest[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(buddy_requests).where(eq(buddy_requests.status, 'waiting'));
        return rows.map((r: any) => this.mapRequest(r));
    }

    expireStaleBuddyRequests(ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async expireStaleBuddyRequestsAsync(ctx?: TransactionContext): Promise<number> {
        const dbClient = ctx?.db || this.db;
        const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
        const result = await dbClient.update(buddy_requests)
            .set({ status: 'expired', ended_at: sql`CURRENT_TIMESTAMP` })
            .where(and(
                eq(buddy_requests.status, 'waiting'),
                lt(buddy_requests.created_at, cutoff)
            ))
            .returning({ id: buddy_requests.id });
        return result.length;
    }

    matchBuddyPair(requestId1: number, matchedUser1Id: string, requestId2: number, matchedUser2Id: string, matchScore: number, ctx?: TransactionContext): number {
        throw new Error('Use async version for PostgreSQL');
    }

    async matchBuddyPairAsync(requestId1: string, matchedUser1Id: string, requestId2: string, matchedUser2Id: string, matchScore: number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        await dbClient.update(buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUser2Id, match_score: matchScore, ended_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_requests.id, requestId1));
        await dbClient.update(buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUser1Id, match_score: matchScore, ended_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_requests.id, requestId2));
        return true;
    }

    unmatchBuddyPair(userId: string, requestId?: number | null, ctx?: TransactionContext): UnmatchResult {
        throw new Error('Use async version for PostgreSQL');
    }

    async unmatchBuddyPairAsync(userId: string, requestId?: string | null, ctx?: TransactionContext): Promise<UnmatchResult> {
        const dbClient = ctx?.db || this.db;

        let myRequest: any = null;
        if (requestId) {
            const rows = await dbClient.select().from(buddy_requests).where(eq(buddy_requests.id, requestId)).limit(1);
            myRequest = rows[0] || null;
        } else {
            const rows = await dbClient.select().from(buddy_requests)
                .where(and(eq(buddy_requests.user_id, userId), eq(buddy_requests.status, 'matched')))
                .orderBy(sql`${buddy_requests.ended_at} DESC`).limit(1);
            myRequest = rows[0] || null;
        }

        if (!myRequest) return { ok: false, reason: 'no_match_found' };
        const partnerId = myRequest.matched_user_id;

        await dbClient.update(buddy_requests)
            .set({ status: 'unmatched', ended_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_requests.id, myRequest.id));

        // Find partner request
        const partnerRows = await dbClient.select().from(buddy_requests)
            .where(and(eq(buddy_requests.user_id, partnerId), eq(buddy_requests.matched_user_id, userId), eq(buddy_requests.status, 'matched')))
            .limit(1);
        const partnerRequest = partnerRows[0] || null;

        if (partnerRequest) {
            await dbClient.update(buddy_requests)
                .set({ status: 'unmatched', ended_at: sql`CURRENT_TIMESTAMP` })
                .where(eq(buddy_requests.id, partnerRequest.id));
        }

        // Record unmatch
        await dbClient.insert(buddy_unmatches)
            .values({ unmatcher_id: userId, unmatched_id: partnerId })
            .onConflictDoNothing();

        return {
            ok: true,
            partnerId,
            myRequestId: myRequest.id,
            partnerRequestId: partnerRequest?.id || null
        };
    }

    matchBuddyRequest(requestId: number, matchedUserId: string, matchScore: number, ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async matchBuddyRequestAsync(requestId: string, matchedUserId: string, matchScore: number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_requests)
            .set({ status: 'matched', matched_user_id: matchedUserId, match_score: matchScore, ended_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_requests.id, requestId))
            .returning({ id: buddy_requests.id });
        return result.length > 0;
    }

    endBuddyRequest(requestId: number, status: string = 'ended', ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async endBuddyRequestAsync(requestId: string, status: string = 'ended', ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_requests)
            .set({ status, ended_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_requests.id, requestId))
            .returning({ id: buddy_requests.id });
        return result.length > 0;
    }

    setBuddyDestination(requestId: number, userId: string, choice: string, ctx?: TransactionContext): SetDestinationResult {
        throw new Error('Use async version for PostgreSQL');
    }

    async setBuddyDestinationAsync(requestId: string, userId: string, choice: string, ctx?: TransactionContext): Promise<SetDestinationResult> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_requests)
            .set({ destination: choice })
            .where(and(eq(buddy_requests.id, requestId), eq(buddy_requests.user_id, userId)))
            .returning({ id: buddy_requests.id });
        if (result.length === 0) return { ok: false, reason: 'not_found' };
        return { ok: true, choice };
    }

    getMatchDestinationState(myRequestId: number, userId: string, ctx?: TransactionContext): DestinationStateResult {
        throw new Error('Use async version for PostgreSQL');
    }

    async getMatchDestinationStateAsync(myRequestId: string, userId: string, ctx?: TransactionContext): Promise<DestinationStateResult> {
        const dbClient = ctx?.db || this.db;
        const myRow = await dbClient.select().from(buddy_requests).where(eq(buddy_requests.id, myRequestId)).limit(1);
        if (!myRow[0]) return { ok: false, reason: 'not_found' };

        const partnerRows = await dbClient.select().from(buddy_requests)
            .where(and(eq(buddy_requests.user_id, myRow[0].matched_user_id), eq(buddy_requests.matched_user_id, userId)))
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

    recordHubConsent(matchKey: string, requestId: number, userId: string, decision: string, ctx?: TransactionContext): { ok: boolean, changed?: boolean, reason?: string } {
        throw new Error('Use async version for PostgreSQL');
    }

    async recordHubConsentAsync(matchKey: string, requestId: string, userId: string, decision: string, ctx?: TransactionContext): Promise<{ ok: boolean, changed?: boolean, reason?: string }> {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select().from(buddy_hub_consents)
            .where(and(eq(buddy_hub_consents.match_key, matchKey), eq(buddy_hub_consents.user_id, userId)))
            .limit(1);

        if (existing.length > 0 && existing[0].decision === decision) {
            return { ok: true, changed: false };
        }

        await dbClient.insert(buddy_hub_consents)
            .values({ match_key: matchKey, request_id: requestId, user_id: userId, decision })
            .onConflictDoUpdate({
                target: [buddy_hub_consents.match_key, buddy_hub_consents.user_id],
                set: { decision, updated_at: sql`CURRENT_TIMESTAMP` }
            });

        return { ok: true, changed: true };
    }

    getHubConsents(matchKey: string, ctx?: TransactionContext): BuddyHubConsent[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getHubConsentsAsync(matchKey: string, ctx?: TransactionContext): Promise<BuddyHubConsent[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(buddy_hub_consents).where(eq(buddy_hub_consents.match_key, matchKey));
        return rows.map((r: any) => ({
            id: r.id, match_key: r.match_key, request_id: r.request_id, user_id: r.user_id,
            decision: r.decision, created_at: r.created_at, updated_at: r.updated_at
        }));
    }

    clearHubConsents(matchKey: string, userId?: string | null, ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async clearHubConsentsAsync(matchKey: string, userId?: string | null, ctx?: TransactionContext): Promise<number> {
        const dbClient = ctx?.db || this.db;
        const where = userId
            ? and(eq(buddy_hub_consents.match_key, matchKey), eq(buddy_hub_consents.user_id, userId))
            : eq(buddy_hub_consents.match_key, matchKey);
        const result = await dbClient.delete(buddy_hub_consents).where(where).returning({ id: buddy_hub_consents.id });
        return result.length;
    }

    claimHubInvite(matchKey: string, hubGuildId: string, ctx?: TransactionContext): ClaimHubInviteResult {
        throw new Error('Use async version for PostgreSQL');
    }

    async claimHubInviteAsync(matchKey: string, hubGuildId: string, ctx?: TransactionContext): Promise<ClaimHubInviteResult> {
        const dbClient = ctx?.db || this.db;
        const existing = await dbClient.select().from(buddy_hub_invites).where(eq(buddy_hub_invites.match_key, matchKey)).limit(1);
        if (existing.length > 0) {
            return { claimed: false, isNew: false, existing: existing[0] };
        }
        const result = await dbClient.insert(buddy_hub_invites)
            .values({ match_key: matchKey, hub_guild_id: hubGuildId, status: 'pending' })
            .returning();
        return { claimed: true, isNew: true, row: result[0] };
    }

    getHubInvite(matchKey: string, ctx?: TransactionContext): BuddyHubInvite | null {
        throw new Error('Use async version for PostgreSQL');
    }

    async getHubInviteAsync(matchKey: string, ctx?: TransactionContext): Promise<BuddyHubInvite | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(buddy_hub_invites).where(eq(buddy_hub_invites.match_key, matchKey)).limit(1);
        return result.length > 0 ? result[0] : null;
    }

    markHubInviteSent(matchKey: string, url: string | null, code: string | null, ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async markHubInviteSentAsync(matchKey: string, url: string | null, code: string | null, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_hub_invites)
            .set({ status: 'sent', invite_url: url, invite_code: code, sent_at: sql`CURRENT_TIMESTAMP` })
            .where(eq(buddy_hub_invites.match_key, matchKey))
            .returning({ id: buddy_hub_invites.id });
        return result.length > 0;
    }

    markHubInviteFailed(matchKey: string, ctx?: TransactionContext): { changes: number } {
        throw new Error('Use async version for PostgreSQL');
    }

    async markHubInviteFailedAsync(matchKey: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(buddy_hub_invites)
            .set({ status: 'failed' })
            .where(eq(buddy_hub_invites.match_key, matchKey))
            .returning({ id: buddy_hub_invites.id });
        return result.length > 0;
    }

    isGlobalBuddyMatchingEnabled(guildId: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async isGlobalBuddyMatchingEnabledAsync(guildId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guild_settings.global_buddy_matching_enabled })
            .from(guild_settings).where(eq(guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }

    isStudyHubEnabled(guildId: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async isStudyHubEnabledAsync(guildId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guild_settings.study_hub_enabled })
            .from(guild_settings).where(eq(guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }

    isStudyHubAcceptingGuests(guildId: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async isStudyHubAcceptingGuestsAsync(guildId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ v: guild_settings.study_hub_accepts_guests })
            .from(guild_settings).where(eq(guild_settings.guild_id, guildId)).limit(1);
        return result.length > 0 ? Boolean(result[0].v) : false;
    }

    getEligibleStudyHubs(ctx?: TransactionContext): string[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getEligibleStudyHubsAsync(ctx?: TransactionContext): Promise<string[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select({ guild_id: guild_settings.guild_id })
            .from(guild_settings)
            .where(and(eq(guild_settings.study_hub_enabled, true), eq(guild_settings.study_hub_accepts_guests, true)));
        return rows.map((r: any) => r.guild_id);
    }

    isBuddyBlocked(userA: string, userB: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async isBuddyBlockedAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: buddy_blocks.blocker_id }).from(buddy_blocks)
            .where(or(
                and(eq(buddy_blocks.blocker_id, userA), eq(buddy_blocks.blocked_id, userB)),
                and(eq(buddy_blocks.blocker_id, userB), eq(buddy_blocks.blocked_id, userA))
            ))
            .limit(1);
        return result.length > 0;
    }

    blockBuddyUser(blockerId: string, blockedId: string, ctx?: TransactionContext): { created: boolean } {
        throw new Error('Use async version for PostgreSQL');
    }

    async blockBuddyUserAsync(blockerId: string, blockedId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(buddy_blocks).values({ blocker_id: blockerId, blocked_id: blockedId }).onConflictDoNothing();
            return true;
        } catch {
            return false;
        }
    }

    isBuddyUnmatched(userA: string, userB: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async isBuddyUnmatchedAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: buddy_unmatches.unmatcher_id }).from(buddy_unmatches)
            .where(or(
                and(eq(buddy_unmatches.unmatcher_id, userA), eq(buddy_unmatches.unmatched_id, userB)),
                and(eq(buddy_unmatches.unmatcher_id, userB), eq(buddy_unmatches.unmatched_id, userA))
            ))
            .limit(1);
        return result.length > 0;
    }

    hasBuddyMatchHistory(userA: string, userB: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async hasBuddyMatchHistoryAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: buddy_requests.id }).from(buddy_requests)
            .where(or(
                and(eq(buddy_requests.user_id, userA), eq(buddy_requests.matched_user_id, userB)),
                and(eq(buddy_requests.user_id, userB), eq(buddy_requests.matched_user_id, userA))
            ))
            .limit(1);
        return result.length > 0;
    }

    createBuddyReport(data: CreateBuddyReportInput, ctx?: TransactionContext): CreateBuddyReportResult {
        throw new Error('Use async version for PostgreSQL');
    }

    async createBuddyReportAsync(data: CreateBuddyReportInput, ctx?: TransactionContext): Promise<CreateBuddyReportResult> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(buddy_reports).values({
            reporter_user_id: data.reporterId,
            reported_user_id: data.reportedId,
            request_id: data.requestId ? String(data.requestId) : null,
            reason: data.reason,
            description: data.description || null
        }).returning({ id: buddy_reports.id });
        return { ok: true, reason: 'created', id: result[0].id };
    }

    countBuddyReportsToday(reporterId: string, ctx?: TransactionContext): number {
        throw new Error('Use async version for PostgreSQL');
    }

    async countBuddyReportsTodayAsync(reporterId: string, ctx?: TransactionContext): Promise<number> {
        const dbClient = ctx?.db || this.db;
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const result = await dbClient.select({ count: sql`COUNT(*)` }).from(buddy_reports)
            .where(and(
                eq(buddy_reports.reporter_user_id, reporterId),
                sql`${buddy_reports.created_at} >= ${dayStart.toISOString()}`
            ));
        return Number(result[0]?.count || 0);
    }

    countRecentBuddyRequests(userId: string, minutes: number, ctx?: TransactionContext): number {
        throw new Error('Use async version for PostgreSQL');
    }

    async countRecentBuddyRequestsAsync(userId: string, minutes: number, ctx?: TransactionContext): Promise<number> {
        const dbClient = ctx?.db || this.db;
        const cutoff = new Date(Date.now() - minutes * 60 * 1000).toISOString();
        const result = await dbClient.select({ count: sql`COUNT(*)` }).from(buddy_requests)
            .where(and(
                eq(buddy_requests.user_id, userId),
                sql`${buddy_requests.created_at} >= ${cutoff}`
            ));
        return Number(result[0]?.count || 0);
    }

    recordBuddySwipe(swiperId: string, targetUserId: string, targetRequestId: number, action: string, ctx?: TransactionContext): { created: boolean } {
        throw new Error('Use async version for PostgreSQL');
    }

    async recordBuddySwipeAsync(swiperId: string, targetUserId: string, targetRequestId: string, action: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(buddy_swipes)
                .values({ swiper_id: swiperId, target_user_id: targetUserId, target_request_id: targetRequestId, action })
                .onConflictDoNothing();
            return true;
        } catch {
            return false;
        }
    }

    hasBuddyLiked(likerId: string, likedUserId: string, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async hasBuddyLikedAsync(likerId: string, likedUserId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ id: buddy_swipes.id }).from(buddy_swipes)
            .where(and(eq(buddy_swipes.swiper_id, likerId), eq(buddy_swipes.target_user_id, likedUserId), eq(buddy_swipes.action, 'like')))
            .limit(1);
        return result.length > 0;
    }

    getBuddyActedUserIds(swiperId: string, ctx?: TransactionContext): string[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getBuddyActedUserIdsAsync(swiperId: string, ctx?: TransactionContext): Promise<string[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select({ target_user_id: buddy_swipes.target_user_id })
            .from(buddy_swipes).where(eq(buddy_swipes.swiper_id, swiperId));
        return rows.map((r: any) => r.target_user_id);
    }

    buddyMatchScope(matchKey: string, ctx?: TransactionContext): 'local' | 'global' | null {
        throw new Error('Use async version for PostgreSQL');
    }

    async buddyMatchScopeAsync(matchKey: string, ctx?: TransactionContext): Promise<'local' | 'global' | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select({ scope: buddy_analytics_events.scope })
            .from(buddy_analytics_events)
            .where(and(eq(buddy_analytics_events.match_key, matchKey), eq(buddy_analytics_events.event_name, 'match_formed')))
            .limit(1);
        const scope = result[0]?.scope;
        return (scope === 'local' || scope === 'global') ? scope : null;
    }

    recordBuddyEvent(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async recordBuddyEventAsync(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(buddy_analytics_events).values({
            event_name: eventName,
            user_id: fields?.userId || null,
            guild_id: fields?.guildId || null,
            request_id: fields?.requestId ? String(fields.requestId) : null,
            match_key: fields?.matchKey || null,
            scope: fields?.scope || null
        });
        return true;
    }

    getBuddyFunnelStats(options?: BuddyFunnelStatsInput, ctx?: TransactionContext): any {
        throw new Error('Use async version for PostgreSQL');
    }

    async getBuddyFunnelStatsAsync(options?: BuddyFunnelStatsInput, ctx?: TransactionContext): Promise<any> {
        const dbClient = ctx?.db || this.db;
        const days = options?.days || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const rows = await dbClient.select({
            event_name: buddy_analytics_events.event_name,
            count: sql`COUNT(*)`
        })
        .from(buddy_analytics_events)
        .where(sql`${buddy_analytics_events.created_at} >= ${cutoff}`)
        .groupBy(buddy_analytics_events.event_name);
        
        const stats: Record<string, number> = {};
        for (const row of rows) {
            stats[row.event_name] = Number(row.count);
        }
        return stats;
    }
}
