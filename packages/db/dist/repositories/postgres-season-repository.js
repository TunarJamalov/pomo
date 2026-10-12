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
exports.PostgresSeasonRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresSeasonRepository {
    db;
    identityRepository;
    constructor(db, identityRepository) {
        this.db = db;
        this.identityRepository = identityRepository;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async getActiveSeason(ctx) {
        const seasons = await this.getDb(ctx)
            .select()
            .from(schema.seasons)
            .where((0, drizzle_orm_1.eq)(schema.seasons.is_active, true))
            .limit(1);
        if (!seasons.length)
            return null;
        return this.mapSeason(seasons[0]);
    }
    async startNewSeason(name, ctx) {
        // End active season
        await this.getDb(ctx)
            .update(schema.seasons)
            .set({ is_active: false, ended_at: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema.seasons.is_active, true));
        // Start new season
        const [season] = await this.getDb(ctx)
            .insert(schema.seasons)
            .values({
            name,
            is_active: true
        })
            .returning();
        // Reset all season data
        await this.getDb(ctx)
            .update(schema.users)
            .set({
            season_xp: 0,
            season_focus_minutes: 0
        });
        await this.getDb(ctx)
            .update(schema.clans)
            .set({ season_xp: 0 });
        await this.getDb(ctx)
            .update(schema.guild_progress)
            .set({ season_xp: 0 });
        return this.mapSeason(season);
    }
    async getSeasonLeaderboard(limit = 100, ctx) {
        const usersList = await this.getDb(ctx)
            .select()
            .from(schema.users)
            .where((0, drizzle_orm_1.sql) `season_xp > 0`)
            .orderBy((0, drizzle_orm_1.desc)(schema.users.season_xp))
            .limit(limit);
        const results = [];
        for (const u of usersList) {
            const discordId = await this.identityRepository.getIdentity(u.id, 'discord', ctx);
            if (discordId) {
                results.push({
                    discord_id: discordId,
                    season_xp: u.season_xp || 0,
                    season_focus_minutes: u.season_focus_minutes || 0,
                    level: u.level || 1
                });
            }
        }
        return results;
    }
    mapSeason(row) {
        return {
            id: row.id,
            name: row.name,
            is_active: row.is_active,
            started_at: row.started_at instanceof Date ? row.started_at.toISOString() : (row.started_at || ''),
            ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at
        };
    }
}
exports.PostgresSeasonRepository = PostgresSeasonRepository;
