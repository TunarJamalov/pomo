import { SessionRepository, CreateSessionData, Session } from './session-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { IdentityRepository } from './identity-repository';
export declare class SqliteSessionRepository implements SessionRepository {
    private db;
    private identityRepo;
    constructor(db: any, identityRepo: IdentityRepository);
    private mapRow;
    createSession(ctx: TransactionContext, data: CreateSessionData): Promise<Session>;
    getSessionById(ctx: TransactionContext, sessionId: number): Session | null;
    getActiveSession(ctx: TransactionContext, userId: string): Promise<Session | null>;
    getUncompletedSessions(ctx: TransactionContext): Session[];
    pauseSession(ctx: TransactionContext, sessionId: number): boolean;
    resumeSession(ctx: TransactionContext, sessionId: number): boolean;
    completeSession(ctx: TransactionContext, sessionId: number): Session | null;
    cancelSession(ctx: TransactionContext, sessionId: number): boolean;
    updateMessageId(ctx: TransactionContext, sessionId: number, messageId: string): boolean;
    updatePomodoroData(ctx: TransactionContext, sessionId: number, data: any): boolean;
    markReminderSent(ctx: TransactionContext, sessionId: number): boolean;
}
