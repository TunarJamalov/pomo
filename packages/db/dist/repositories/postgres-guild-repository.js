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
exports.PostgresGuildRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const schema = __importStar(require("../schema"));
class PostgresGuildRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.transaction || this.db;
    }
    async getOrCreateSettings(guildId, guildName, ctx) {
        const existing = await this.getDb(ctx)
            .select()
            .from(schema.guild_settings)
            .where((0, drizzle_orm_1.eq)(schema.guild_settings.guild_id, guildId))
            .limit(1);
        if (existing.length) {
            if (guildName && existing[0].guild_name !== guildName) {
                await this.getDb(ctx)
                    .update(schema.guild_settings)
                    .set({ guild_name: guildName })
                    .where((0, drizzle_orm_1.eq)(schema.guild_settings.guild_id, guildId));
                existing[0].guild_name = guildName;
            }
            return existing[0];
        }
        const [newSettings] = await this.getDb(ctx)
            .insert(schema.guild_settings)
            .values({
            guild_id: guildId,
            guild_name: guildName || null
        })
            .returning();
        return newSettings;
    }
    async updateGuildScore(guildId, guildName, minutes, ctx) {
        await this.getOrCreateSettings(guildId, guildName, ctx);
        const updateData = {
            total_focus_minutes: (0, drizzle_orm_1.sql) `total_focus_minutes + ${minutes}`
        };
        if (guildName) {
            updateData.guild_name = guildName;
        }
        await this.getDb(ctx)
            .update(schema.guild_settings)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(schema.guild_settings.guild_id, guildId));
    }
    async recordQuestProgress(guildId, userId, minutes, sourceType, sourceId, ctx) {
        // In Postgres, guild_quests/guild_quest_contributions are tracked differently.
        // For now, we ensure the guild exists. Full quest logic can be added when quest schema is migrated.
        await this.getOrCreateSettings(guildId, null, ctx);
    }
}
exports.PostgresGuildRepository = PostgresGuildRepository;
