import { Database } from 'better-sqlite3';
import { GuildSettings, GuildRepository } from './guild-repository';
export declare class SqliteGuildRepository implements GuildRepository {
    private db;
    constructor(db: Database);
    getOrCreateSettings(guildId: string, guildName?: string | null): Promise<GuildSettings>;
    updateGuildScore(guildId: string, guildName: string | null, minutes: number): Promise<void>;
    recordQuestProgress(guildId: string, userId: string, minutes: number, sourceType: string, sourceId: string): Promise<void>;
}
