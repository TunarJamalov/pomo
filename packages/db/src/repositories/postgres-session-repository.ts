import { SessionRepository, Session, CreateSessionData } from './session-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { sessions, session_participants } from '../schema/sessions';

export class PostgresSessionRepository implements SessionRepository {
    constructor(private db: any) {}

    private mapSession(row: any): Session {
        return {
            id: String(row.id),
            user_id: row.owner_id || '',
            guild_id: row.guild_id || null,
            channel_id: row.channel_id || null,
            message_id: row.message_id || null,
            duration: row.duration,
            title: row.title || 'Study Session',
            started_at: row.started_at,
            ends_at: row.ends_at || null,
            completed: row.status === 'completed',
            reminder_sent: Boolean(row.reminder_sent),
            paused: Boolean(row.paused),
            paused_at: row.paused_at || null,
            paused_total_seconds: row.paused_total_seconds || 0,
            pause_count: row.pause_count || 0,
            todo_id: null, // Sessions schema has no todo_id in PG; tracked via tasks
            subject: row.subject || 'general',
            pomodoro_data: row.pomodoro_data ? JSON.stringify(row.pomodoro_data) : null,
            goal_text: null,
            outcome: row.outcome || null,
            buddy_match_key: row.buddy_match_key || null
        };
    }

    async createSession(ctx: TransactionContext, data: CreateSessionData): Promise<Session> {
        const dbClient = ctx?.db || this.db;

        const now = new Date().toISOString();
        const endsAt = data.endsAt?.toISOString() || null;

        const result = await dbClient.insert(sessions).values({
            owner_id: data.userId,
            type: 'solo',
            guild_id: data.guildId || null,
            channel_id: data.channelId || null,
            message_id: data.messageId || null,
            duration: data.duration,
            title: data.title,
            started_at: data.startedAt?.toISOString() || now,
            ends_at: endsAt,
            status: 'active',
            subject: data.subject || 'general',
            pomodoro_data: data.pomodoroData || null,
        }).returning();

        // Add participant record
        await dbClient.insert(session_participants).values({
            session_id: result[0].id,
            user_id: data.userId,
            owner_id: data.userId,
            role: 'host'
        });

        return this.mapSession(result[0]);
    }

    getSessionById(ctx: TransactionContext, sessionId: number | string): Session | null {
        // PostgreSQL requires async — this is a sync wrapper for interface compatibility
        // In practice, callers should use async variants directly
        throw new Error('Use async getSessionByIdAsync for PostgreSQL');
    }

    async getSessionByIdAsync(ctx: TransactionContext, sessionId: string): Promise<Session | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    async getActiveSession(ctx: TransactionContext, userId: string): Promise<Session | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(sessions)
            .where(and(eq(sessions.owner_id, userId), eq(sessions.status, 'active')))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    getUncompletedSessions(ctx: TransactionContext): Session[] {
        throw new Error('Use async getUncompletedSessionsAsync for PostgreSQL');
    }

    async getUncompletedSessionsAsync(ctx: TransactionContext): Promise<Session[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select()
            .from(sessions)
            .where(eq(sessions.status, 'active'));
        return rows.map((r: any) => this.mapSession(r));
    }

    pauseSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async pauseSessionAsync for PostgreSQL');
    }

    async pauseSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ paused: true, paused_at: sql`CURRENT_TIMESTAMP`, status: 'paused' })
            .where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active')))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    resumeSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async resumeSessionAsync for PostgreSQL');
    }

    async resumeSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const row = await dbClient.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
        if (row.length === 0 || !row[0].paused_at) return false;

        const pausedAt = new Date(row[0].paused_at);
        const extraSeconds = Math.round((Date.now() - pausedAt.getTime()) / 1000);
        const newPausedTotal = (row[0].paused_total_seconds || 0) + extraSeconds;

        const result = await dbClient.update(sessions)
            .set({ paused: false, paused_at: null, paused_total_seconds: newPausedTotal, status: 'active' })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    completeSession(ctx: TransactionContext, sessionId: number | string): Session | null {
        throw new Error('Use async completeSessionAsync for PostgreSQL');
    }

    async completeSessionAsync(ctx: TransactionContext, sessionId: string): Promise<Session | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ status: 'completed' })
            .where(eq(sessions.id, sessionId))
            .returning();
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    cancelSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async cancelSessionAsync for PostgreSQL');
    }

    async cancelSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ status: 'cancelled' })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    updateMessageId(ctx: TransactionContext, sessionId: number | string, messageId: string): boolean {
        throw new Error('Use async updateMessageIdAsync for PostgreSQL');
    }

    async updateMessageIdAsync(ctx: TransactionContext, sessionId: string, messageId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ message_id: messageId })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    updatePomodoroData(ctx: TransactionContext, sessionId: number | string, data: any): boolean {
        throw new Error('Use async updatePomodoroDataAsync for PostgreSQL');
    }

    async updatePomodoroDataAsync(ctx: TransactionContext, sessionId: string, data: any): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ pomodoro_data: data })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    markReminderSent(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async markReminderSentAsync for PostgreSQL');
    }

    async markReminderSentAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ reminder_sent: 1 })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }
}
