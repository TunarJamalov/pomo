import { Database } from 'better-sqlite3';
import { VoiceSession, VoiceSessionRepository } from './voice-session-repository';
import { IdentityRepository } from './identity-repository';
export declare class SqliteVoiceSessionRepository implements VoiceSessionRepository {
    private db;
    private identityRepository;
    constructor(db: Database, identityRepository: IdentityRepository);
    createSession(userId: string, guildId: string, channelId: string): Promise<VoiceSession>;
    getActiveSession(userId: string, guildId?: string | null): Promise<VoiceSession | null>;
    getActiveSessions(guildId?: string | null): Promise<VoiceSession[]>;
    touchSession(sessionId: string | number): Promise<void>;
    completeSession(sessionId: string | number, values: Partial<VoiceSession>): Promise<VoiceSession | null>;
    getRewardedMinutesForDay(userId: string, date: string): Promise<number>;
    getVoiceStats(userId: string): Promise<{
        total_minutes: number;
        total_sessions: number;
    }>;
}
