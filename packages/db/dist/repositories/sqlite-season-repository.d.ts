import { Database } from 'better-sqlite3';
import { Season, SeasonRepository } from './season-repository';
export declare class SqliteSeasonRepository implements SeasonRepository {
    private db;
    constructor(db: Database);
    getActiveSeason(): Promise<Season | null>;
    startNewSeason(name: string): Promise<Season>;
    getSeasonLeaderboard(limit?: number): Promise<{
        discord_id: string;
        season_xp: number;
        season_focus_minutes: number;
        level: number;
    }[]>;
}
