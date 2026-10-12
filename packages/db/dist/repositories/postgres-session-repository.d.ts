import { SessionRepository, Session, CreateSessionData } from './session-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresSessionRepository implements SessionRepository {
    private db;
    constructor(db: any);
    private mapSession;
    createSession(ctx: TransactionContext, data: CreateSessionData): Promise<Session>;
    getSessionById(ctx: TransactionContext, sessionId: number | string): Session | null;
    getSessionByIdAsync(ctx: TransactionContext, sessionId: string): Promise<Session | null>;
    getActiveSession(ctx: TransactionContext, userId: string): Promise<Session | null>;
    getUncompletedSessions(ctx: TransactionContext): Session[];
    getUncompletedSessionsAsync(ctx: TransactionContext): Promise<Session[]>;
    pauseSession(ctx: TransactionContext, sessionId: number | string): boolean;
    pauseSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean>;
    resumeSession(ctx: TransactionContext, sessionId: number | string): boolean;
    resumeSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean>;
    completeSession(ctx: TransactionContext, sessionId: number | string): Session | null;
    completeSessionAsync(ctx: TransactionContext, sessionId: string): Promise<Session | null>;
    cancelSession(ctx: TransactionContext, sessionId: number | string): boolean;
    cancelSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean>;
    updateMessageId(ctx: TransactionContext, sessionId: number | string, messageId: string): boolean;
    updateMessageIdAsync(ctx: TransactionContext, sessionId: string, messageId: string): Promise<boolean>;
    updatePomodoroData(ctx: TransactionContext, sessionId: number | string, data: any): boolean;
    updatePomodoroDataAsync(ctx: TransactionContext, sessionId: string, data: any): Promise<boolean>;
    markReminderSent(ctx: TransactionContext, sessionId: number | string): boolean;
    markReminderSentAsync(ctx: TransactionContext, sessionId: string): Promise<boolean>;
}
