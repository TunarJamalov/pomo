import { Database } from 'better-sqlite3';
import { TransactionContext } from '../transaction/transaction-manager';
import { PomoMatchRepository, CreateBuddyRequestInput, BuddyRequest, BuddyHubConsent, BuddyHubInvite, UnmatchResult, DestinationStateResult, SetDestinationResult, ClaimHubInviteResult, CreateBuddyReportInput, CreateBuddyReportResult, BuddyFunnelStatsInput } from './pomomatch-repository';
export declare class SqlitePomoMatchRepository implements PomoMatchRepository {
    private db;
    constructor(db: Database);
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
    createBuddyReport({ reporterId, reportedId, requestId, reason, description }: CreateBuddyReportInput, ctx?: TransactionContext): CreateBuddyReportResult;
    countBuddyReportsToday(reporterId: string, ctx?: TransactionContext): number;
    countRecentBuddyRequests(userId: string, minutes: number, ctx?: TransactionContext): number;
    recordBuddySwipe(swiperId: string, targetUserId: string, targetRequestId: number, action: string, ctx?: TransactionContext): {
        created: boolean;
    };
    hasBuddyLiked(likerId: string, likedUserId: string, ctx?: TransactionContext): boolean;
    getBuddyActedUserIds(swiperId: string, ctx?: TransactionContext): string[];
    buddyMatchScope(matchKey: string, ctx?: TransactionContext): 'local' | 'global' | null;
    recordBuddyEvent(eventName: string, fields?: Record<string, any>, ctx?: TransactionContext): boolean;
    getBuddyFunnelStats({ days, guildId }?: BuddyFunnelStatsInput, ctx?: TransactionContext): any;
}
