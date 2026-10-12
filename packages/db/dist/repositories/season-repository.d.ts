import { TransactionContext } from '../transaction/transaction-manager';
export interface Season {
    id: string | number;
    name: string;
    is_active: boolean;
    started_at: string;
    ended_at: string | null;
}
export interface SeasonRepository {
    getActiveSeason(ctx?: TransactionContext): Promise<Season | null>;
    startNewSeason(name: string, ctx?: TransactionContext): Promise<Season>;
    getSeasonLeaderboard(limit?: number, ctx?: TransactionContext): Promise<{
        discord_id: string;
        season_xp: number;
        season_focus_minutes: number;
        level: number;
    }[]>;
}
