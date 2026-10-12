import { TransactionContext } from '../transaction/transaction-manager';

export interface VoiceSession {
    id: number | string;
    user_id: string;
    guild_id: string;
    channel_id: string;
    started_at: string;
    last_seen_at: string | null;
    ended_at: string | null;
    total_minutes: number;
    credited_minutes: number;
    rewarded_minutes: number;
    water_reward: number;
    xp_reward: number;
    status: string;
    end_reason: string | null;
}

export interface VoiceSessionRepository {
    createSession(userId: string, guildId: string, channelId: string, ctx?: TransactionContext): Promise<VoiceSession>;
    getActiveSession(userId: string, guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession | null>;
    getActiveSessions(guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession[]>;
    touchSession(sessionId: string | number, ctx?: TransactionContext): Promise<void>;
    completeSession(sessionId: string | number, values: Partial<VoiceSession>, ctx?: TransactionContext): Promise<VoiceSession | null>;
    getRewardedMinutesForDay(userId: string, date: string, ctx?: TransactionContext): Promise<number>;
    getVoiceStats(userId: string, ctx?: TransactionContext): Promise<{ total_minutes: number; total_sessions: number }>;
}
