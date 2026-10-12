"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteGuildRepository = void 0;
class SqliteGuildRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getOrCreateSettings(guildId, guildName) {
        let settings = this.db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId);
        if (!settings) {
            this.db.prepare("INSERT INTO guild_settings (guild_id, guild_name) VALUES (?, ?)").run(guildId, guildName || null);
            settings = this.db.prepare("SELECT * FROM guild_settings WHERE guild_id = ?").get(guildId);
        }
        else if (guildName && settings.guild_name !== guildName) {
            this.db.prepare("UPDATE guild_settings SET guild_name = ? WHERE guild_id = ?").run(guildName, guildId);
            settings.guild_name = guildName;
        }
        return {
            id: settings.guild_id,
            guild_id: settings.guild_id,
            guild_name: settings.guild_name,
            time_zone: settings.timezone,
            total_focus_minutes: settings.total_focus_minutes,
            global_buddy_matching_enabled: settings.global_buddy_matching_enabled,
            study_hub_accepts_guests: settings.study_hub_accepts_guests
        };
    }
    async updateGuildScore(guildId, guildName, minutes) {
        await this.getOrCreateSettings(guildId, guildName);
        this.db.prepare(`
            UPDATE guild_settings
            SET total_focus_minutes = total_focus_minutes + ?,
                guild_name = COALESCE(?, guild_name)
            WHERE guild_id = ?
        `).run(minutes, guildName, guildId);
    }
    async recordQuestProgress(guildId, userId, minutes, sourceType, sourceId) {
        // No-op: quest progress is handled directly in database.js via raw SQL for SQLite
    }
}
exports.SqliteGuildRepository = SqliteGuildRepository;
