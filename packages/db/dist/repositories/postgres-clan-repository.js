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
exports.PostgresClanRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresClanRepository {
    db;
    identityRepository;
    constructor(db, identityRepository) {
        this.db = db;
        this.identityRepository = identityRepository;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async getClanByUserId(userId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return null;
        const members = await this.getDb(ctx)
            .select()
            .from(schema.clan_members)
            .where((0, drizzle_orm_1.eq)(schema.clan_members.user_id, canonicalUserId))
            .limit(1);
        if (!members.length)
            return null;
        const clanId = members[0].clan_id;
        return this.getClanById(clanId, ctx);
    }
    async getClanById(clanId, ctx) {
        const clans = await this.getDb(ctx)
            .select()
            .from(schema.clans)
            .where((0, drizzle_orm_1.eq)(schema.clans.id, String(clanId)))
            .limit(1);
        if (!clans.length)
            return null;
        return this.mapClan(clans[0]);
    }
    async createClan(ownerId, name, ctx) {
        const canonicalOwnerId = await this.identityRepository.lookupIdentity('discord', ownerId, ctx);
        if (!canonicalOwnerId)
            throw new Error('User not found');
        const [clan] = await this.getDb(ctx)
            .insert(schema.clans)
            .values({
            name,
            owner_id: canonicalOwnerId
        })
            .returning();
        await this.getDb(ctx)
            .insert(schema.clan_members)
            .values({
            clan_id: clan.id,
            user_id: canonicalOwnerId,
            role: 'owner'
        });
        return this.mapClan(clan);
    }
    async joinClan(clanId, userId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            throw new Error('User not found');
        await this.getDb(ctx)
            .insert(schema.clan_members)
            .values({
            clan_id: String(clanId),
            user_id: canonicalUserId,
            role: 'member'
        });
    }
    async leaveClan(userId, ctx) {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId)
            return;
        await this.getDb(ctx)
            .delete(schema.clan_members)
            .where((0, drizzle_orm_1.eq)(schema.clan_members.user_id, canonicalUserId));
    }
    async addClanXP(clanId, minutes, xpBoost, ctx) {
        await this.getDb(ctx)
            .update(schema.clans)
            .set({
            total_focus_minutes: (0, drizzle_orm_1.sql) `total_focus_minutes + ${minutes}`,
            xp: (0, drizzle_orm_1.sql) `xp + ${xpBoost}`,
            season_xp: (0, drizzle_orm_1.sql) `season_xp + ${xpBoost}`
        })
            .where((0, drizzle_orm_1.eq)(schema.clans.id, String(clanId)));
    }
    async getClanMembers(clanId, ctx) {
        const members = await this.getDb(ctx)
            .select()
            .from(schema.clan_members)
            .where((0, drizzle_orm_1.eq)(schema.clan_members.clan_id, String(clanId)));
        const results = [];
        for (const m of members) {
            // we need discord_id for the bot
            const identity = await this.identityRepository.getIdentity(m.user_id, 'discord', ctx);
            if (identity) {
                results.push({
                    id: m.user_id,
                    clan_id: m.clan_id,
                    discord_id: identity,
                    role: m.role || 'member',
                    joined_at: m.joined_at instanceof Date ? m.joined_at.toISOString() : (m.joined_at || '')
                });
            }
        }
        return results;
    }
    async getClanLeaderboard(limit = 10, ctx) {
        const clans = await this.getDb(ctx)
            .select()
            .from(schema.clans)
            .orderBy((0, drizzle_orm_1.desc)(schema.clans.season_xp))
            .limit(limit);
        return clans.map((c) => this.mapClan(c));
    }
    mapClan(row) {
        return {
            id: row.id,
            name: row.name,
            owner_id: row.owner_id,
            water: row.water || 0,
            xp: row.xp || 0,
            season_xp: row.season_xp || 0,
            level: row.level || 1,
            tree_level: row.tree_level || 1,
            total_focus_minutes: row.total_focus_minutes || 0,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || '')
        };
    }
}
exports.PostgresClanRepository = PostgresClanRepository;
