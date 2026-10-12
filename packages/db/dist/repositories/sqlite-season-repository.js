"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteSeasonRepository = void 0;
class SqliteSeasonRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getActiveSeason() {
        return this.db.prepare("SELECT * FROM seasons WHERE is_active = 1 LIMIT 1").get();
    }
    async startNewSeason(name) {
        this.db.prepare("UPDATE seasons SET is_active = 0, ended_at = datetime('now') WHERE is_active = 1").run();
        const res = this.db.prepare("INSERT INTO seasons (name, is_active) VALUES (?, 1)").run(name);
        // Reset all season data across tables
        this.db.prepare("UPDATE users SET season_xp = 0, season_focus_minutes = 0").run();
        this.db.prepare("UPDATE clans SET season_xp = 0").run();
        this.db.prepare("UPDATE guild_progress SET season_xp = 0").run();
        return this.db.prepare("SELECT * FROM seasons WHERE id = ?").get(res.lastInsertRowid);
    }
    async getSeasonLeaderboard(limit = 100) {
        return this.db.prepare("SELECT discord_id, season_xp, season_focus_minutes, level FROM users WHERE season_xp > 0 ORDER BY season_xp DESC LIMIT ?").all(limit);
    }
}
exports.SqliteSeasonRepository = SqliteSeasonRepository;
