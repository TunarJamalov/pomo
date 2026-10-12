import { GuildSettings, GuildRepository } from './guild-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresGuildRepository implements GuildRepository {
    private db;
    constructor(db: any);
    private getDb;
    getOrCreateSettings(guildId: string, guildName?: string | null, ctx?: TransactionContext): Promise<GuildSettings>;
    updateGuildScore(guildId: string, guildName: string | null, minutes: number, ctx?: TransactionContext): Promise<void>;
    recordQuestProgress(guildId: string, userId: string, minutes: number, sourceType: string, sourceId: string, ctx?: TransactionContext): Promise<void>;
}
