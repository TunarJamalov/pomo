import { TeamSessionRepository, TeamSession, TeamMember, CreateTeamSessionData } from './team-session-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, sql, or } from 'drizzle-orm';
import { sessions, session_participants } from '../schema/sessions';

export class PostgresTeamSessionRepository implements TeamSessionRepository {
    constructor(private db: any) {}

    private mapSession(row: any): TeamSession {
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

    createSession(ctx: TransactionContext, data: CreateTeamSessionData): TeamSession {
        throw new Error('Use async createSessionAsync for PostgreSQL');
    }

    async createSessionAsync(ctx: TransactionContext, data: CreateTeamSessionData): Promise<TeamSession> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.insert(sessions).values({
            owner_id: data.hostId,
            type: 'team',
            guild_id: data.guildId || null,
            channel_id: data.channelId || null,
            duration: data.duration,
            title: 'Team Session',
            status: 'waiting',
        }).returning();

        await dbClient.insert(session_participants).values({
            session_id: result[0].id,
            user_id: data.hostId,
            owner_id: data.hostId,
            role: 'host'
        });

        return this.mapSession(result[0]);
    }

    getSessionById(ctx: TransactionContext, sessionId: number | string): TeamSession | null {
        throw new Error('Use async getSessionByIdAsync for PostgreSQL');
    }

    async getSessionByIdAsync(ctx: TransactionContext, sessionId: string): Promise<TeamSession | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions)
            .where(and(eq(sessions.id, sessionId), eq(sessions.type, 'team')))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    getActiveOrWaitingSessionByHost(ctx: TransactionContext, hostId: string): TeamSession | null {
        throw new Error('Use async version for PostgreSQL');
    }

    async getActiveOrWaitingSessionByHostAsync(ctx: TransactionContext, hostId: string): Promise<TeamSession | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(sessions)
            .where(and(
                eq(sessions.owner_id, hostId),
                eq(sessions.type, 'team'),
                or(eq(sessions.status, 'active'), eq(sessions.status, 'waiting'))
            ))
            .limit(1);
        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    getActiveOrWaitingSessionByUserId(ctx: TransactionContext, userId: string): TeamSession | null {
        throw new Error('Use async version for PostgreSQL');
    }

    async getActiveOrWaitingSessionByUserIdAsync(ctx: TransactionContext, userId: string): Promise<TeamSession | null> {
        const dbClient = ctx?.db || this.db;
        // Find session where user is a participant
        const parts = await dbClient.select({ session_id: session_participants.session_id })
            .from(session_participants)
            .where(eq(session_participants.user_id, userId));
        
        if (parts.length === 0) return null;
        const sessionIds = parts.map((p: any) => p.session_id);

        const result = await dbClient.select().from(sessions)
            .where(and(
                eq(sessions.type, 'team'),
                or(eq(sessions.status, 'active'), eq(sessions.status, 'waiting')),
                sql`${sessions.id} = ANY(${sessionIds})`
            ))
            .limit(1);

        return result.length > 0 ? this.mapSession(result[0]) : null;
    }

    getActiveSessions(ctx: TransactionContext): TeamSession[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getActiveSessionsAsync(ctx: TransactionContext): Promise<TeamSession[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(sessions)
            .where(and(
                eq(sessions.type, 'team'),
                or(eq(sessions.status, 'active'), eq(sessions.status, 'waiting'))
            ));
        return rows.map((r: any) => this.mapSession(r));
    }

    getMembers(ctx: TransactionContext, sessionId: number | string): TeamMember[] {
        throw new Error('Use async version for PostgreSQL');
    }

    async getMembersAsync(ctx: TransactionContext, sessionId: string): Promise<TeamMember[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(session_participants)
            .where(eq(session_participants.session_id, sessionId));
        return rows.map((r: any) => ({ sessionId: r.session_id, userId: r.user_id }));
    }

    addMember(ctx: TransactionContext, sessionId: number | string, userId: string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async addMemberAsync(ctx: TransactionContext, sessionId: string, userId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        try {
            await dbClient.insert(session_participants).values({
                session_id: sessionId,
                user_id: userId,
                role: 'member'
            }).onConflictDoNothing();
            return true;
        } catch {
            return false;
        }
    }

    removeMember(ctx: TransactionContext, sessionId: number | string, userId: string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async removeMemberAsync(ctx: TransactionContext, sessionId: string, userId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(session_participants)
            .where(and(eq(session_participants.session_id, sessionId), eq(session_participants.user_id, userId)))
            .returning({ id: session_participants.id });
        return result.length > 0;
    }

    startSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async startSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        return this.updateSessionStatusAsync(ctx, sessionId, 'active');
    }

    updateSessionStatus(ctx: TransactionContext, sessionId: number | string, status: TeamSession['status']): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async updateSessionStatusAsync(ctx: TransactionContext, sessionId: string, status: TeamSession['status']): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ status })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    completeSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async completeSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        return this.updateSessionStatusAsync(ctx, sessionId, 'completed');
    }

    cancelSession(ctx: TransactionContext, sessionId: number | string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async cancelSessionAsync(ctx: TransactionContext, sessionId: string): Promise<boolean> {
        return this.updateSessionStatusAsync(ctx, sessionId, 'cancelled');
    }

    updateMessageId(ctx: TransactionContext, sessionId: number | string, messageId: string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async updateMessageIdAsync(ctx: TransactionContext, sessionId: string, messageId: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ message_id: messageId })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    updateDurationAndEndsAt(ctx: TransactionContext, sessionId: number | string, duration: number, endsAt: string): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async updateDurationAndEndsAtAsync(ctx: TransactionContext, sessionId: string, duration: number, endsAt: string): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ duration, ends_at: endsAt })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }

    updatePomodoroData(ctx: TransactionContext, sessionId: number | string, data: any): boolean {
        throw new Error('Use async version for PostgreSQL');
    }

    async updatePomodoroDataAsync(ctx: TransactionContext, sessionId: string, data: any): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(sessions)
            .set({ pomodoro_data: data })
            .where(eq(sessions.id, sessionId))
            .returning({ id: sessions.id });
        return result.length > 0;
    }
}
