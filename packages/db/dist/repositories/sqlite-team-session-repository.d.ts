import { TeamSessionRepository, CreateTeamSessionData, TeamSession, TeamMember } from './team-session-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteTeamSessionRepository implements TeamSessionRepository {
    private db;
    constructor(db: any);
    private mapRow;
    createSession(ctx: TransactionContext, data: CreateTeamSessionData): TeamSession;
    getSessionById(ctx: TransactionContext, sessionId: number): TeamSession | null;
    getActiveOrWaitingSessionByHost(ctx: TransactionContext, hostId: string): TeamSession | null;
    getActiveOrWaitingSessionByUserId(ctx: TransactionContext, userId: string): TeamSession | null;
    getMembers(ctx: TransactionContext, sessionId: number): TeamMember[];
    addMember(ctx: TransactionContext, sessionId: number, userId: string): boolean;
    removeMember(ctx: TransactionContext, sessionId: number, userId: string): boolean;
    startSession(ctx: TransactionContext, sessionId: number): boolean;
    updateSessionStatus(ctx: TransactionContext, sessionId: number, status: TeamSession['status']): boolean;
    completeSession(ctx: TransactionContext, sessionId: number): boolean;
    cancelSession(ctx: TransactionContext, sessionId: number): boolean;
    updateMessageId(ctx: TransactionContext, sessionId: number, messageId: string): boolean;
    updateDurationAndEndsAt(ctx: TransactionContext, sessionId: number, duration: number, endsAt: string): boolean;
    updatePomodoroData(ctx: TransactionContext, sessionId: number, data: any): boolean;
    getActiveSessions(ctx: TransactionContext): TeamSession[];
}
