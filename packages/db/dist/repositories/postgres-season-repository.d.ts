import { Season, SeasonRepository } from './season-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresSeasonRepository implements SeasonRepository {
    private db;
    private identityRepository;
    constructor(db: any, identityRepository: IdentityRepository);
    private getDb;
    getActiveSeason(ctx?: TransactionContext): Promise<Season | null>;
    startNewSeason(name: string, ctx?: TransactionContext): Promise<Season>;
    getSeasonLeaderboard(limit?: number, ctx?: TransactionContext): Promise<{
        discord_id: string;
        season_xp: number;
        season_focus_minutes: number;
        level: number;
    }[]>;
    private mapSeason;
}
