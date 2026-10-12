import { Database } from 'better-sqlite3';
import { Season, SeasonRepository } from './season-repository';

export class SqliteSeasonRepository implements SeasonRepository {
    constructor(private db: Database) {}

    async getActiveSeason(): Promise<Season | null> {
        return this.db.prepare("SELECT * FROM seasons WHERE is_active = 1 LIMIT 1").get() as Season | null;
    }

    async startNewSeason(name: string): Promise<Season> {
        this.db.prepare("UPDATE seasons SET is_active = 0, ended_at = datetime('now') WHERE is_active = 1").run();
        const res = this.db.prepare("INSERT INTO seasons (name, is_active) VALUES (?, 1)").run(name);
        
        // Reset all season data across tables
        this.db.prepare("UPDATE users SET season_xp = 0, season_focus_minutes = 0").run();
        this.db.prepare("UPDATE clans SET season_xp = 0").run();
        this.db.prepare("UPDATE guild_progress SET season_xp = 0").run();
        
        return this.db.prepare("SELECT * FROM seasons WHERE id = ?").get(res.lastInsertRowid) as Season;
    }

    async getSeasonLeaderboard(limit: number = 100): Promise<{ discord_id: string; season_xp: number; season_focus_minutes: number; level: number; }[]> {
        return this.db.prepare("SELECT discord_id, season_xp, season_focus_minutes, level FROM users WHERE season_xp > 0 ORDER BY season_xp DESC LIMIT ?").all(limit) as any;
    }
}
