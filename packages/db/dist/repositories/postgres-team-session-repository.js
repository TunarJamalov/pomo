"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresTeamSessionRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const sessions_1 = require("../schema/sessions");
class PostgresTeamSessionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapSession(row) {
        return {
            id: String(row.id),
            guildId: row.guild_id || '',
            channelId: row.channel_id || '',
            hostId: row.owner_id || '',
            messageId: row.message_id || null,
            duration: row.duration,
            startedAt: row.started_at,
            endsAt: row.ends_at || null,
            status: (row.status === 'cancelled' || row.status === 'completed' || row.status === 'break') ? row.status :
                (row.status === 'waiting' ? 'waiting' : 'active'),
            paused: Boolean(row.paused),
            pausedAt: row.paused_at || null,
            pausedTotalSeconds: row.paused_total_seconds || 0,
            pauseCount: row.pause_count || 0,
            pomodoroData: row.pomodoro_data || null
        };
    }
    createSession(ctx, data) {
        throw new Error('Use async createSessionAsync for PostgreSQL');
    }
    async createSessionAsync(ctx, data) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(sessions_1.sessions).values({
            owner_id: data.hostId,
            type: 'team',
            guild_id: data.guildId || null,
            channel_id: data.channelId || null,
            duration: data.duration,
            title: 'Team Session',
            status: 'waiting',
        }).returning();
        await dbClient.insert(sessions_1.session_participants).values({
            session_id: result[0].id,
            user_id: data.hostId,
            owner_id: data.hostId,
            role: 'host'
        });
        return this.mapSession(result[0]);
    }
    getSessionById(ctx, sessionId) {
        throw new Error('Use async getSessionByIdAsync for PostgreSQL');
    }
    async getSessionByIdAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId), (0, drizzle_orm_1.eq)(sessions_1.sessions.type, 'team')))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    getActiveOrWaitingSessionByHost(ctx, hostId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getActiveOrWaitingSessionByHostAsync(ctx, hostId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.owner_id, hostId), (0, drizzle_orm_1.eq)(sessions_1.sessions.type, 'team'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active'), (0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'waiting'))))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    getActiveOrWaitingSessionByUserId(ctx, userId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getActiveOrWaitingSessionByUserIdAsync(ctx, userId) {
        const dbClient = ctx?.db || this.db;
        // Find session where user is a participant
        const parts = await dbClient.select({ session_id: sessions_1.session_participants.session_id })
            .from(sessions_1.session_participants)
            .where((0, drizzle_orm_1.eq)(sessions_1.session_participants.user_id, userId));
        if (parts.length === 0)
            return null;
        const sessionIds = parts.map((p) => p.session_id);
        const result = await dbClient.select().from(sessions_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.type, 'team'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active'), (0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'waiting')), (0, drizzle_orm_1.sql) `${sessions_1.sessions.id} = ANY(${sessionIds})`))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }
    getActiveSessions(ctx) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getActiveSessionsAsync(ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(sessions_1.sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.sessions.type, 'team'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'active'), (0, drizzle_orm_1.eq)(sessions_1.sessions.status, 'waiting'))));
        return rows.map((r) => this.mapSession(r));
    }
    getMembers(ctx, sessionId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async getMembersAsync(ctx, sessionId) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(sessions_1.session_participants)
            .where((0, drizzle_orm_1.eq)(sessions_1.session_participants.session_id, sessionId));
        return rows.map((r) => ({ sessionId: r.session_id, userId: r.user_id }));
    }
    addMember(ctx, sessionId, userId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async addMemberAsync(ctx, sessionId, userId) {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(sessions_1.session_participants).values({
                session_id: sessionId,
                user_id: userId,
                role: 'member'
            }).onConflictDoNothing();
            return true;
        }
        catch {
            return false;
        }
    }
    removeMember(ctx, sessionId, userId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async removeMemberAsync(ctx, sessionId, userId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(sessions_1.session_participants)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(sessions_1.session_participants.session_id, sessionId), (0, drizzle_orm_1.eq)(sessions_1.session_participants.user_id, userId)))
            .returning({ id: sessions_1.session_participants.id });
        return result.length > 0;
    }
    startSession(ctx, sessionId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async startSessionAsync(ctx, sessionId) {
        return this.updateSessionStatusAsync(ctx, sessionId, 'active');
    }
    updateSessionStatus(ctx, sessionId, status) {
        throw new Error('Use async version for PostgreSQL');
    }
    async updateSessionStatusAsync(ctx, sessionId, status) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ status })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    completeSession(ctx, sessionId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async completeSessionAsync(ctx, sessionId) {
        return this.updateSessionStatusAsync(ctx, sessionId, 'completed');
    }
    cancelSession(ctx, sessionId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async cancelSessionAsync(ctx, sessionId) {
        return this.updateSessionStatusAsync(ctx, sessionId, 'cancelled');
    }
    updateMessageId(ctx, sessionId, messageId) {
        throw new Error('Use async version for PostgreSQL');
    }
    async updateMessageIdAsync(ctx, sessionId, messageId) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ message_id: messageId })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    updateDurationAndEndsAt(ctx, sessionId, duration, endsAt) {
        throw new Error('Use async version for PostgreSQL');
    }
    async updateDurationAndEndsAtAsync(ctx, sessionId, duration, endsAt) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ duration, ends_at: endsAt })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
    updatePomodoroData(ctx, sessionId, data) {
        throw new Error('Use async version for PostgreSQL');
    }
    async updatePomodoroDataAsync(ctx, sessionId, data) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions_1.sessions)
            .set({ pomodoro_data: data })
            .where((0, drizzle_orm_1.eq)(sessions_1.sessions.id, sessionId))
            .returning({ id: sessions_1.sessions.id });
        return result.length > 0;
    }
}
exports.PostgresTeamSessionRepository = PostgresTeamSessionRepository;
