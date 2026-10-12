"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresVoiceSessionRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresVoiceSessionRepository {
    db;
    identityRepository;
    constructor(db, identityRepository) {
        this.db = db;
        this.identityRepository = identityRepository;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async createSession(userId, guildId, channelId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            throw new Error('User not found');
        const existing = await this.getActiveSession(userId, guildId, ctx);
        if (existing)
            return existing;
        const [session] = await this.getDb(ctx).insert(schema.voice_sessions).values({
            user_id: canonicalUserId,
            guild_id: guildId,
            channel_id: channelId,
            status: 'active'
        }).returning();
        return this.mapToVoiceSession(session);
    }
    async getActiveSession(userId, guildId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return null;
        const query = this.getDb(ctx)
            .select()
            .from(schema.voice_sessions)
            .where(guildId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.user_id, canonicalUserId), (0, drizzle_orm_1.eq)(schema.voice_sessions.guild_id, guildId), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active'))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.user_id, canonicalUserId), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active')))
            .limit(1);
        const rows = await query;
        return rows.length > 0 ? this.mapToVoiceSession(rows[0]) : null;
    }
    async getActiveSessions(guildId, ctx) {
        const query = this.getDb(ctx)
            .select()
            .from(schema.voice_sessions)
            .where(guildId
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.guild_id, guildId), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active'))
            : (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active'));
        const rows = await query;
        return rows.map(this.mapToVoiceSession);
    }
    async touchSession(sessionId, ctx) {
        await this.getDb(ctx)
            .update(schema.voice_sessions)
            .set({ last_seen_at: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.id, String(sessionId)), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active')));
    }
    async completeSession(sessionId, values, ctx) {
        const [updated] = await this.getDb(ctx)
            .update(schema.voice_sessions)
            .set({
            ended_at: values.ended_at ? new Date(values.ended_at) : (0, drizzle_orm_1.sql) `now()`,
            total_minutes: values.total_minutes,
            credited_minutes: values.credited_minutes,
            rewarded_minutes: values.rewarded_minutes,
            water_reward: values.water_reward,
            xp_reward: values.xp_reward,
            status: values.status || 'completed',
            end_reason: values.end_reason || 'left_channel'
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.id, String(sessionId)), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'active')))
            .returning();
        return updated ? this.mapToVoiceSession(updated) : null;
    }
    async getRewardedMinutesForDay(userId, date, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return 0;
        // This is a simplified query; in reality we should parse the date
        const rows = await this.getDb(ctx)
            .select({ total: (0, drizzle_orm_1.sql) `COALESCE(SUM(rewarded_minutes), 0)` })
            .from(schema.voice_sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.user_id, canonicalUserId), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'completed'), (0, drizzle_orm_1.sql) `DATE(ended_at) = ${date}`));
        return Number(rows[0]?.total || 0);
    }
    async getVoiceStats(userId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return { total_minutes: 0, total_sessions: 0 };
        const rows = await this.getDb(ctx)
            .select({
            sessions: (0, drizzle_orm_1.sql) `COUNT(*)`,
            minutes: (0, drizzle_orm_1.sql) `COALESCE(SUM(credited_minutes), 0)`
        })
            .from(schema.voice_sessions)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.voice_sessions.user_id, canonicalUserId), (0, drizzle_orm_1.eq)(schema.voice_sessions.status, 'completed')));
        return {
            total_minutes: Number(rows[0]?.minutes || 0),
            total_sessions: Number(rows[0]?.sessions || 0)
        };
    }
    mapToVoiceSession(row) {
        return {
            ...row,
            started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
            last_seen_at: row.last_seen_at instanceof Date ? row.last_seen_at.toISOString() : row.last_seen_at,
            ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at,
        };
    }
}
exports.PostgresVoiceSessionRepository = PostgresVoiceSessionRepository;
