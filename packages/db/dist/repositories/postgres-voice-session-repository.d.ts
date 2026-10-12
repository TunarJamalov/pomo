import { VoiceSession, VoiceSessionRepository } from './voice-session-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresVoiceSessionRepository implements VoiceSessionRepository {
    private db;
    private identityRepository;
    constructor(db: any, identityRepository: IdentityRepository);
    private getDb;
    createSession(userId: string, guildId: string, channelId: string, ctx?: TransactionContext): Promise<VoiceSession>;
    getActiveSession(userId: string, guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession | null>;
    getActiveSessions(guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession[]>;
    touchSession(sessionId: string | number, ctx?: TransactionContext): Promise<void>;
    completeSession(sessionId: string | number, values: Partial<VoiceSession>, ctx?: TransactionContext): Promise<VoiceSession | null>;
    getRewardedMinutesForDay(userId: string, date: string, ctx?: TransactionContext): Promise<number>;
    getVoiceStats(userId: string, ctx?: TransactionContext): Promise<{
        total_minutes: number;
        total_sessions: number;
    }>;
    private mapToVoiceSession;
}
