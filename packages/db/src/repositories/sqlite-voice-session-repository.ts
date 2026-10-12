import { Database } from 'better-sqlite3';
import { VoiceSession, VoiceSessionRepository } from './voice-session-repository';
import { IdentityRepository } from './identity-repository';

export class SqliteVoiceSessionRepository implements VoiceSessionRepository {
    constructor(private db: Database, private identityRepository: IdentityRepository) {}

    async createSession(userId: string, guildId: string, channelId: string): Promise<VoiceSession> {
        // Resolve UUID
        const identityUserId = await this.identityRepository.lookupIdentity('discord', userId);
        if (!identityUserId) throw new Error('User not found');
        
        // Ensure user exists (mirroring getOrCreateUser but assuming they exist via identity)
        const existing = await this.getActiveSession(userId, guildId);
        if (existing) return existing;

        const result = this.db.prepare(`
            INSERT INTO voice_sessions (user_id, guild_id, channel_id)
            VALUES (?, ?, ?)
        `).run(userId, guildId, channelId);

        return this.db.prepare('SELECT * FROM voice_sessions WHERE id = ?').get(result.lastInsertRowid) as VoiceSession;
    }

    async getActiveSession(userId: string, guildId?: string | null): Promise<VoiceSession | null> {
        if (!guildId) {
            return this.db.prepare(`
                SELECT * FROM voice_sessions
                WHERE user_id = ? AND status = 'active'
                LIMIT 1
            `).get(userId) as VoiceSession | null;
        }
        return this.db.prepare(`
            SELECT * FROM voice_sessions
            WHERE user_id = ? AND guild_id = ? AND status = 'active'
            LIMIT 1
        `).get(userId, guildId) as VoiceSession | null;
    }

    async getActiveSessions(guildId?: string | null): Promise<VoiceSession[]> {
        if (guildId) {
            return this.db.prepare("SELECT * FROM voice_sessions WHERE guild_id = ? AND status = 'active'").all(guildId) as VoiceSession[];
        }
        return this.db.prepare("SELECT * FROM voice_sessions WHERE status = 'active'").all() as VoiceSession[];
    }

    async touchSession(sessionId: string | number): Promise<void> {
        this.db.prepare("UPDATE voice_sessions SET last_seen_at = datetime('now') WHERE id = ? AND status = 'active'").run(sessionId);
    }

    async completeSession(sessionId: string | number, values: Partial<VoiceSession>): Promise<VoiceSession | null> {
        this.db.prepare(`
            UPDATE voice_sessions
            SET ended_at = ?,
                total_minutes = ?,
                credited_minutes = ?,
                rewarded_minutes = ?,
                water_reward = ?,
                xp_reward = ?,
                status = ?,
                end_reason = ?
            WHERE id = ? AND status = 'active'
        `).run(
            values.ended_at,
            values.total_minutes,
            values.credited_minutes,
            values.rewarded_minutes,
            values.water_reward,
            values.xp_reward,
            values.status || 'completed',
            values.end_reason || 'left_channel',
            sessionId,
        );
        return this.db.prepare('SELECT * FROM voice_sessions WHERE id = ?').get(sessionId) as VoiceSession;
    }

    async getRewardedMinutesForDay(userId: string, date: string): Promise<number> {
        const row: any = this.db.prepare(`
            SELECT COALESCE(SUM(rewarded_minutes), 0) as total
            FROM voice_sessions
            WHERE user_id = ?
              AND status = 'completed'
              AND date(ended_at) = ?
        `).get(userId, date);
        return row?.total || 0;
    }

    async getVoiceStats(userId: string): Promise<{ total_minutes: number; total_sessions: number }> {
        const row: any = this.db.prepare(`
            SELECT
                COUNT(*) as sessions,
                COALESCE(SUM(credited_minutes), 0) as minutes,
                COALESCE(SUM(rewarded_minutes), 0) as rewarded_minutes,
                COALESCE(SUM(water_reward), 0) as water,
                COALESCE(SUM(xp_reward), 0) as xp
            FROM voice_sessions
            WHERE user_id = ? AND status = 'completed'
        `).get(userId);
        return { total_minutes: row?.minutes || 0, total_sessions: row?.sessions || 0 };
    }
}
