import { eq, and, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { VoiceSession, VoiceSessionRepository } from './voice-session-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresVoiceSessionRepository implements VoiceSessionRepository {
    constructor(private db: any, private identityRepository: IdentityRepository) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async createSession(userId: string, guildId: string, channelId: string, ctx?: TransactionContext): Promise<VoiceSession> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) throw new Error('User not found');
        
        const existing = await this.getActiveSession(userId, guildId, ctx);
        if (existing) return existing;

        const [session] = await this.getDb(ctx).insert(schema.voice_sessions).values({
            user_id: canonicalUserId,
            guild_id: guildId,
            channel_id: channelId,
            status: 'active'
        }).returning();

        return this.mapToVoiceSession(session);
    }

    async getActiveSession(userId: string, guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession | null> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return null;

        const query = this.getDb(ctx)
            .select()
            .from(schema.voice_sessions)
            .where(
                guildId
                    ? and(
                          eq(schema.voice_sessions.user_id, canonicalUserId),
                          eq(schema.voice_sessions.guild_id, guildId),
                          eq(schema.voice_sessions.status, 'active')
                      )
                    : and(
                          eq(schema.voice_sessions.user_id, canonicalUserId),
                          eq(schema.voice_sessions.status, 'active')
                      )
            )
            .limit(1);

        const rows = await query;
        return rows.length > 0 ? this.mapToVoiceSession(rows[0]) : null;
    }

    async getActiveSessions(guildId?: string | null, ctx?: TransactionContext): Promise<VoiceSession[]> {
        const query = this.getDb(ctx)
            .select()
            .from(schema.voice_sessions)
            .where(
                guildId
                    ? and(
                          eq(schema.voice_sessions.guild_id, guildId),
                          eq(schema.voice_sessions.status, 'active')
                      )
                    : eq(schema.voice_sessions.status, 'active')
            );

        const rows = await query;
        return rows.map(this.mapToVoiceSession);
    }

    async touchSession(sessionId: string | number, ctx?: TransactionContext): Promise<void> {
        await this.getDb(ctx)
            .update(schema.voice_sessions)
            .set({ last_seen_at: sql`now()` })
            .where(
                and(
                    eq(schema.voice_sessions.id, String(sessionId)),
                    eq(schema.voice_sessions.status, 'active')
                )
            );
    }

    async completeSession(sessionId: string | number, values: Partial<VoiceSession>, ctx?: TransactionContext): Promise<VoiceSession | null> {
        const [updated] = await this.getDb(ctx)
            .update(schema.voice_sessions)
            .set({
                ended_at: values.ended_at ? new Date(values.ended_at) : sql`now()`,
                total_minutes: values.total_minutes,
                credited_minutes: values.credited_minutes,
                rewarded_minutes: values.rewarded_minutes,
                water_reward: values.water_reward,
                xp_reward: values.xp_reward,
                status: values.status || 'completed',
                end_reason: values.end_reason || 'left_channel'
            })
            .where(
                and(
                    eq(schema.voice_sessions.id, String(sessionId)),
                    eq(schema.voice_sessions.status, 'active')
                )
            )
            .returning();
            
        return updated ? this.mapToVoiceSession(updated) : null;
    }

    async getRewardedMinutesForDay(userId: string, date: string, ctx?: TransactionContext): Promise<number> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return 0;
        
        // This is a simplified query; in reality we should parse the date
        const rows = await this.getDb(ctx)
            .select({ total: sql`COALESCE(SUM(rewarded_minutes), 0)` })
            .from(schema.voice_sessions)
            .where(
                and(
                    eq(schema.voice_sessions.user_id, canonicalUserId),
                    eq(schema.voice_sessions.status, 'completed'),
                    sql`DATE(ended_at) = ${date}`
                )
            );
            
        return Number(rows[0]?.total || 0);
    }

    async getVoiceStats(userId: string, ctx?: TransactionContext): Promise<{ total_minutes: number; total_sessions: number }> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return { total_minutes: 0, total_sessions: 0 };
        
        const rows = await this.getDb(ctx)
            .select({
                sessions: sql`COUNT(*)`,
                minutes: sql`COALESCE(SUM(credited_minutes), 0)`
            })
            .from(schema.voice_sessions)
            .where(
                and(
                    eq(schema.voice_sessions.user_id, canonicalUserId),
                    eq(schema.voice_sessions.status, 'completed')
                )
            );
            
        return { 
            total_minutes: Number(rows[0]?.minutes || 0), 
            total_sessions: Number(rows[0]?.sessions || 0) 
        };
    }
    
    private mapToVoiceSession(row: any): VoiceSession {
        return {
            ...row,
            started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
            last_seen_at: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
            ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
        };
    }
}
