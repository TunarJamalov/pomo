"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresSessionRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const sessions_1 = require("../schema/sessions");
class PostgresSessionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapSession(row) {
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
    async createSession(ctx, data) {
        const dbClient = ctx?.db || this.db;
        const now = new Date().toISOString();
        const endsAt = data.endsAt?.toISOString() || null;
        const result = await dbClient.insert(sessions_1.sessions).values({
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
        await dbClient.insert(sessions_1.session_participants).values({
            session_id: result[0].id,
            user_id: data.userId,
            owner_id: data.userId,
            role: 'host'
        });
        return this.mapSession(result[0]);
    }
    getSessionById(ctx, sessionId) {
        // PostgreSQL requires async — this is a sync wrapper for interface compatibility
        // In practice, callers should use async variants directly
        throw new Error('Use async getSessionByIdAsync for PostgreSQL');
    }
    async getSessionByIdAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions_1.sessions).where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId)).limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    async getActiveSession(ctx, userId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(sessions_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.owner_id, userId), (0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active')))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    getUncompletedSessions(ctx) {
        throw new Error('Use async getUncompletedSessionsAsync for PostgreSQL');
    }
    async getUncompletedSessionsAsync(ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select()
            .from(sessions_1.sessions)
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active'));
        return rows.map((r) => this.mapSession(r));
    }
    pauseSession(ctx, sessionId) {
        throw new Error('Use async pauseSessionAsync for PostgreSQL');
    }
    async pauseSessionAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ paused: true, paused_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP`, status: 'paused' })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId), (0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active')))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    resumeSession(ctx, sessionId) {
        throw new Error('Use async resumeSessionAsync for PostgreSQL');
    }
    async resumeSessionAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const row = await dbClient.select().from(sessions_1.sessions).where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId)).limit(1);
        if (row.length === 0 || !row[0].paused_at)
            return false;
        const pausedAt = new Date(row[0].paused_at);
        const extraSeconds = Math.round((Date.now() - pausedAt.getTime()) / 1000);
        const newPausedTotal = (row[0].paused_total_seconds || 0) + extraSeconds;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ paused: false, paused_at: null, paused_total_seconds: newPausedTotal, status: 'active' })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    completeSession(ctx, sessionId) {
        throw new Error('Use async completeSessionAsync for PostgreSQL');
    }
    async completeSessionAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ status: 'completed' })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning();
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    cancelSession(ctx, sessionId) {
        throw new Error('Use async cancelSessionAsync for PostgreSQL');
    }
    async cancelSessionAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ status: 'cancelled' })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    updateMessageId(ctx, sessionId, messageId) {
        throw new Error('Use async updateMessageIdAsync for PostgreSQL');
    }
    async updateMessageIdAsync(ctx, sessionId, messageId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ message_id: messageId })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    updatePomodoroData(ctx, sessionId, data) {
        throw new Error('Use async updatePomodoroDataAsync for PostgreSQL');
    }
    async updatePomodoroDataAsync(ctx, sessionId, data) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ pomodoro_data: data })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    markReminderSent(ctx, sessionId) {
        throw new Error('Use async markReminderSentAsync for PostgreSQL');
    }
    async markReminderSentAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ reminder_sent: 1 })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
}
exports.PostgresSessionRepository = PostgresSessionRepository;
