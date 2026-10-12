import { TransactionContext } from '../transaction/transaction-manager';
export interface CreateTeamSessionData {
    guildId?: string;
    channelId?: string;
    hostId: string;
    duration: number;
}
export interface TeamSession {
    id: number | string;
    guildId: string;
    channelId: string;
    hostId: string;
    messageId: string | null;
    duration: number;
    startedAt: string;
    endsAt: string | null;
    status: 'waiting' | 'active' | 'break' | 'cancelled' | 'completed';
    paused: boolean;
    pausedAt: string | null;
    pausedTotalSeconds: number;
    pauseCount: number;
    pomodoroData: any | null;
}
export interface TeamMember {
    sessionId: number;
    userId: string;
}
export interface TeamSessionRepository {
    createSession(ctx: TransactionContext, data: CreateTeamSessionData): TeamSession;
    getSessionById(ctx: TransactionContext, sessionId: number): TeamSession | null;
    getActiveOrWaitingSessionByHost(ctx: TransactionContext, hostId: string): TeamSession | null;
    getActiveOrWaitingSessionByUserId(ctx: TransactionContext, userId: string): TeamSession | null;
    getActiveSessions(ctx: TransactionContext): TeamSession[];
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
}
