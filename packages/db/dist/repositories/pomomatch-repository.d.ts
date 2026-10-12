import { TransactionContext } from '../transaction/transaction-manager';
export interface CreateBuddyRequestInput {
    userId: string;
    guildId: string;
    subject: string | null;
    duration: number | null;
    mode: string | null;
}
export interface BuddyRequest {
    id: number | string;
    user_id: string;
    guild_id: string;
    subject: string | null;
    duration: number | null;
    mode: string | null;
    created_at: string;
    status: string;
    matched_user_id: string | null;
    match_score: number | null;
    session_channel_id: string | null;
    destination: string | null;
    ended_at: string | null;
}
export interface BuddyHubConsent {
    id: number;
    match_key: string;
    request_id: number;
    user_id: string;
    decision: string;
    created_at: string;
    updated_at: string;
}
export interface BuddyHubInvite {
    id: number;
    match_key: string;
    hub_guild_id: string;
    invite_url: string | null;
    invite_code: string | null;
    status: string;
    created_at: string;
    sent_at: string | null;
}
export interface UnmatchResult {
    ok: boolean;
    reason?: string;
    partnerId?: string;
    myRequestId?: number;
    partnerRequestId?: number | null;
}
export interface DestinationStateResult {
    ok: boolean;
    reason?: string;
    myChoice?: string;
    partnerChoice?: string;
    partnerId?: string;
    partnerRequestId?: number;
    confirmed?: boolean;
    confirmedChoice?: string | null;
}
export interface SetDestinationResult {
    ok: boolean;
    reason?: string;
    choice?: string;
}
export interface ClaimHubInviteResult {
    claimed: boolean;
    isNew?: boolean;
    row?: BuddyHubInvite | null;
    existing?: BuddyHubInvite | null;
    reason?: string;
}
export interface CreateBuddyReportInput {
    reporterId: string;
    reportedId: string;
    requestId?: number | null;
    reason: string;
    description?: string | null;
}
export interface CreateBuddyReportResult {
    ok: boolean;
    reason: string;
    id?: number;
}
export interface BuddyFunnelStatsInput {
    days?: number;
    guildId?: string | null;
}
export interface PomoMatchRepository {
    createBuddyRequest(data: CreateBuddyRequestInput, ctx?: TransactionContext): {
        lastInsertRowid: number | bigint;
        changes: number;
    };
    getLatestWaitingBuddyRequestForUser(userId: string, ctx?: TransactionContext): BuddyRequest | null;
    cancelWaitingBuddyRequest(requestId: number, userId: string, ctx?: TransactionContext): {
        changes: number;
    };
    getWaitingBuddyRequests(guildId: string, ctx?: TransactionContext): BuddyRequest[];
    getGlobalWaitingBuddyRequests(ctx?: TransactionContext): BuddyRequest[];
    expireStaleBuddyRequests(ctx?: TransactionContext): {
        changes: number;
    };
    matchBuddyPair(requestId1: number, matchedUser1Id: string, requestId2: number, matchedUser2Id: string, matchScore: number, ctx?: TransactionContext): number;
    unmatchBuddyPair(userId: string, requestId?: number | null, ctx?: TransactionContext): UnmatchResult;
    matchBuddyRequest(requestId: number, matchedUserId: string, matchScore: number, ctx?: TransactionContext): {
        changes: number;
    };
    endBuddyRequest(requestId: number, status?: string, ctx?: TransactionContext): {
        changes: number;
    };
    setBuddyDestination(requestId: number, userId: string, choice: string, ctx?: TransactionContext): SetDestinationResult;
    getMatchDestinationState(myRequestId: number, userId: string, ctx?: TransactionContext): DestinationStateResult;
    recordHubConsent(matchKey: string, requestId: number, userId: string, decision: string, ctx?: TransactionContext): {
        ok: boolean;
        changed?: boolean;
        reason?: string;
    };
    getHubConsents(matchKey: string, ctx?: TransactionContext): BuddyHubConsent[];
    clearHubConsents(matchKey: string, userId?: string | null, ctx?: TransactionContext): {
        changes: number;
    };
    claimHubInvite(matchKey: string, hubGuildId: string, ctx?: TransactionContext): ClaimHubInviteResult;
    getHubInvite(matchKey: string, ctx?: TransactionContext): BuddyHubInvite | null;
    markHubInviteSent(matchKey: string, url: string | null, code: string | null, ctx?: TransactionContext): {
        changes: number;
    };
    markHubInviteFailed(matchKey: string, ctx?: TransactionContext): {
        changes: number;
    };
    isGlobalBuddyMatchingEnabled(guildId: string, ctx?: TransactionContext): boolean;
    isStudyHubEnabled(guildId: string, ctx?: TransactionContext): boolean;
    isStudyHubAcceptingGuests(guildId: string, ctx?: TransactionContext): boolean;
    getEligibleStudyHubs(ctx?: TransactionContext): string[];
    isBuddyBlocked(userA: string, userB: string, ctx?: TransactionContext): boolean;
    blockBuddyUser(blockerId: string, blockedId: string, ctx?: TransactionContext): {
        created: boolean;
    };
    isBuddyUnmatched(userA: string, userB: string, ctx?: TransactionContext): boolean;
    hasBuddyMatchHistory(userA: string, userB: string, ctx?: TransactionContext): boolean;
    createBuddyReport(data: CreateBuddyReportInput, ctx?: TransactionContext): CreateBuddyReportResult;
    countBuddyReportsToday(reporterId: string, ctx?: TransactionContext): number;
    countRecentBuddyRequests(userId: string, minutes: number, ctx?: TransactionContext): number;
    recordBuddySwipe(swiperId: string, targetUserId: string, targetRequestId: number, action: string, ctx?: TransactionContext): {
        created: boolean;
    };
    hasBuddyLiked(likerId: string, likedUserId: string, ctx?: TransactionContext): boolean;
    getBuddyActedUserIds(swiperId: string, ctx?: TransactionContext): string[];
    buddyMatchScope(matchKey: string, ctx?: TransactionContext): 'local' | 'global' | null;
    recordBuddyEvent(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): boolean;
    getBuddyFunnelStats(options?: BuddyFunnelStatsInput, ctx?: TransactionContext): any;
}
