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
exports.PostgresChallengeRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresChallengeRepository {
    db;
    identityRepository;
    constructor(db, identityRepository) {
        this.db = db;
        this.identityRepository = identityRepository;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async createChallenge(creatorId, title, challengeType, targetValue, startDate, endDate, guildId, ctx) {
        const canonicalCreatorId = await this.identityRepository.lookupIdentity('discord', creatorId, ctx);
        if (!canonicalCreatorId)
            throw new Error('User not found');
        const [challenge] = await this.getDb(ctx)
            .insert(schema.challenges)
            .values({
            creator_id: canonicalCreatorId,
            guild_id: guildId || null,
            title,
            challenge_type: challengeType,
            target_value: targetValue,
            start_date: new Date(startDate),
            end_date: new Date(endDate),
            status: 'active'
        })
            .returning();
        await this.joinChallenge(challenge.id, creatorId, ctx);
        return this.mapChallenge(challenge);
    }
    async getChallenge(challengeId, ctx) {
        const rows = await this.getDb(ctx)
            .select()
            .from(schema.challenges)
            .where((0, drizzle_orm_1.eq)(schema.challenges.id, String(challengeId)))
            .limit(1);
        if (!rows.length)
            return null;
        return this.mapChallenge(rows[0]);
    }
    async joinChallenge(challengeId, userId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            throw new Error('User not found');
        await this.getDb(ctx)
            .insert(schema.challenge_members)
            .values({
            challenge_id: String(challengeId),
            user_id: canonicalUserId,
            progress: 0
        });
    }
    async updateChallengeProgress(challengeId, userId, progressAmount, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return;
        await this.getDb(ctx)
            .update(schema.challenge_members)
            .set({ progress: (0, drizzle_orm_1.sql) `progress + ${progressAmount}` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.challenge_members.challenge_id, String(challengeId)), (0, drizzle_orm_1.eq)(schema.challenge_members.user_id, canonicalUserId)));
    }
    async getChallengeLeaderboard(challengeId, limit = 10, ctx) {
        const rows = await this.getDb(ctx)
            .select()
            .from(schema.challenge_members)
            .where((0, drizzle_orm_1.eq)(schema.challenge_members.challenge_id, String(challengeId)))
            .orderBy((0, drizzle_orm_1.desc)(schema.challenge_members.progress))
            .limit(limit);
        const results = [];
        for (const row of rows) {
            const discordId = await this.identityRepository.getIdentity(row.user_id, 'discord', ctx);
            if (discordId) {
                results.push({
                    discord_id: discordId,
                    progress: row.progress || 0
                });
            }
        }
        return results;
    }
    mapChallenge(row) {
        return {
            id: row.id,
            creator_id: row.creator_id,
            guild_id: row.guild_id,
            title: row.title,
            challenge_type: row.challenge_type,
            target_value: row.target_value,
            start_date: row.start_date instanceof Date ? row.start_date.toISOString() : (row.start_date || ''),
            end_date: row.end_date instanceof Date ? row.end_date.toISOString() : (row.end_date || ''),
            status: row.status,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || '')
        };
    }
}
exports.PostgresChallengeRepository = PostgresChallengeRepository;
