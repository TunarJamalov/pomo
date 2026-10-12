import { PomoMatchRepository, CreateBuddyRequestInput, BuddyRequest, BuddyHubConsent, BuddyHubInvite, UnmatchResult, DestinationStateResult, SetDestinationResult, ClaimHubInviteResult, CreateBuddyReportInput, CreateBuddyReportResult, BuddyFunnelStatsInput } from './pomomatch-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresPomoMatchRepository implements PomoMatchRepository {
    private db;
    constructor(db: any);
    private mapRequest;
    createBuddyRequest(data: CreateBuddyRequestInput, ctx?: TransactionContext): {
        lastInsertRowid: number | bigint;
        changes: number;
    };
    createBuddyRequestAsync(data: CreateBuddyRequestInput, ctx?: TransactionContext): Promise<BuddyRequest>;
    getLatestWaitingBuddyRequestForUser(userId: string, ctx?: TransactionContext): BuddyRequest | null;
    getLatestWaitingBuddyRequestForUserAsync(userId: string, ctx?: TransactionContext): Promise<BuddyRequest | null>;
    cancelWaitingBuddyRequest(requestId: number, userId: string, ctx?: TransactionContext): {
        changes: number;
    };
    cancelWaitingBuddyRequestAsync(requestId: string, userId: string, ctx?: TransactionContext): Promise<boolean>;
    getWaitingBuddyRequests(guildId: string, ctx?: TransactionContext): BuddyRequest[];
    getWaitingBuddyRequestsAsync(guildId: string, ctx?: TransactionContext): Promise<BuddyRequest[]>;
    getGlobalWaitingBuddyRequests(ctx?: TransactionContext): BuddyRequest[];
    getGlobalWaitingBuddyRequestsAsync(ctx?: TransactionContext): Promise<BuddyRequest[]>;
    expireStaleBuddyRequests(ctx?: TransactionContext): {
        changes: number;
    };
    expireStaleBuddyRequestsAsync(ctx?: TransactionContext): Promise<number>;
    matchBuddyPair(requestId1: number, matchedUser1Id: string, requestId2: number, matchedUser2Id: string, matchScore: number, ctx?: TransactionContext): number;
    matchBuddyPairAsync(requestId1: string, matchedUser1Id: string, requestId2: string, matchedUser2Id: string, matchScore: number, ctx?: TransactionContext): Promise<boolean>;
    unmatchBuddyPair(userId: string, requestId?: number | null, ctx?: TransactionContext): UnmatchResult;
    unmatchBuddyPairAsync(userId: string, requestId?: string | null, ctx?: TransactionContext): Promise<UnmatchResult>;
    matchBuddyRequest(requestId: number, matchedUserId: string, matchScore: number, ctx?: TransactionContext): {
        changes: number;
    };
    matchBuddyRequestAsync(requestId: string, matchedUserId: string, matchScore: number, ctx?: TransactionContext): Promise<boolean>;
    endBuddyRequest(requestId: number, status?: string, ctx?: TransactionContext): {
        changes: number;
    };
    endBuddyRequestAsync(requestId: string, status?: string, ctx?: TransactionContext): Promise<boolean>;
    setBuddyDestination(requestId: number, userId: string, choice: string, ctx?: TransactionContext): SetDestinationResult;
    setBuddyDestinationAsync(requestId: string, userId: string, choice: string, ctx?: TransactionContext): Promise<SetDestinationResult>;
    getMatchDestinationState(myRequestId: number, userId: string, ctx?: TransactionContext): DestinationStateResult;
    getMatchDestinationStateAsync(myRequestId: string, userId: string, ctx?: TransactionContext): Promise<DestinationStateResult>;
    recordHubConsent(matchKey: string, requestId: number, userId: string, decision: string, ctx?: TransactionContext): {
        ok: boolean;
        changed?: boolean;
        reason?: string;
    };
    recordHubConsentAsync(matchKey: string, requestId: string, userId: string, decision: string, ctx?: TransactionContext): Promise<{
        ok: boolean;
        changed?: boolean;
        reason?: string;
    }>;
    getHubConsents(matchKey: string, ctx?: TransactionContext): BuddyHubConsent[];
    getHubConsentsAsync(matchKey: string, ctx?: TransactionContext): Promise<BuddyHubConsent[]>;
    clearHubConsents(matchKey: string, userId?: string | null, ctx?: TransactionContext): {
        changes: number;
    };
    clearHubConsentsAsync(matchKey: string, userId?: string | null, ctx?: TransactionContext): Promise<number>;
    claimHubInvite(matchKey: string, hubGuildId: string, ctx?: TransactionContext): ClaimHubInviteResult;
    claimHubInviteAsync(matchKey: string, hubGuildId: string, ctx?: TransactionContext): Promise<ClaimHubInviteResult>;
    getHubInvite(matchKey: string, ctx?: TransactionContext): BuddyHubInvite | null;
    getHubInviteAsync(matchKey: string, ctx?: TransactionContext): Promise<BuddyHubInvite | null>;
    markHubInviteSent(matchKey: string, url: string | null, code: string | null, ctx?: TransactionContext): {
        changes: number;
    };
    markHubInviteSentAsync(matchKey: string, url: string | null, code: string | null, ctx?: TransactionContext): Promise<boolean>;
    markHubInviteFailed(matchKey: string, ctx?: TransactionContext): {
        changes: number;
    };
    markHubInviteFailedAsync(matchKey: string, ctx?: TransactionContext): Promise<boolean>;
    isGlobalBuddyMatchingEnabled(guildId: string, ctx?: TransactionContext): boolean;
    isGlobalBuddyMatchingEnabledAsync(guildId: string, ctx?: TransactionContext): Promise<boolean>;
    isStudyHubEnabled(guildId: string, ctx?: TransactionContext): boolean;
    isStudyHubEnabledAsync(guildId: string, ctx?: TransactionContext): Promise<boolean>;
    isStudyHubAcceptingGuests(guildId: string, ctx?: TransactionContext): boolean;
    isStudyHubAcceptingGuestsAsync(guildId: string, ctx?: TransactionContext): Promise<boolean>;
    getEligibleStudyHubs(ctx?: TransactionContext): string[];
    getEligibleStudyHubsAsync(ctx?: TransactionContext): Promise<string[]>;
    isBuddyBlocked(userA: string, userB: string, ctx?: TransactionContext): boolean;
    isBuddyBlockedAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean>;
    blockBuddyUser(blockerId: string, blockedId: string, ctx?: TransactionContext): {
        created: boolean;
    };
    blockBuddyUserAsync(blockerId: string, blockedId: string, ctx?: TransactionContext): Promise<boolean>;
    isBuddyUnmatched(userA: string, userB: string, ctx?: TransactionContext): boolean;
    isBuddyUnmatchedAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean>;
    hasBuddyMatchHistory(userA: string, userB: string, ctx?: TransactionContext): boolean;
    hasBuddyMatchHistoryAsync(userA: string, userB: string, ctx?: TransactionContext): Promise<boolean>;
    createBuddyReport(data: CreateBuddyReportInput, ctx?: TransactionContext): CreateBuddyReportResult;
    createBuddyReportAsync(data: CreateBuddyReportInput, ctx?: TransactionContext): Promise<CreateBuddyReportResult>;
    countBuddyReportsToday(reporterId: string, ctx?: TransactionContext): number;
    countBuddyReportsTodayAsync(reporterId: string, ctx?: TransactionContext): Promise<number>;
    countRecentBuddyRequests(userId: string, minutes: number, ctx?: TransactionContext): number;
    countRecentBuddyRequestsAsync(userId: string, minutes: number, ctx?: TransactionContext): Promise<number>;
    recordBuddySwipe(swiperId: string, targetUserId: string, targetRequestId: number, action: string, ctx?: TransactionContext): {
        created: boolean;
    };
    recordBuddySwipeAsync(swiperId: string, targetUserId: string, targetRequestId: string, action: string, ctx?: TransactionContext): Promise<boolean>;
    hasBuddyLiked(likerId: string, likedUserId: string, ctx?: TransactionContext): boolean;
    hasBuddyLikedAsync(likerId: string, likedUserId: string, ctx?: TransactionContext): Promise<boolean>;
    getBuddyActedUserIds(swiperId: string, ctx?: TransactionContext): string[];
    getBuddyActedUserIdsAsync(swiperId: string, ctx?: TransactionContext): Promise<string[]>;
    buddyMatchScope(matchKey: string, ctx?: TransactionContext): 'local' | 'global' | null;
    buddyMatchScopeAsync(matchKey: string, ctx?: TransactionContext): Promise<'local' | 'global' | null>;
    recordBuddyEvent(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): boolean;
    recordBuddyEventAsync(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): Promise<boolean>;
    getBuddyFunnelStats(options?: BuddyFunnelStatsInput, ctx?: TransactionContext): any;
    getBuddyFunnelStatsAsync(options?: BuddyFunnelStatsInput, ctx?: TransactionContext): Promise<any>;
}
