import { TransactionContext } from '../transaction/transaction-manager';
export interface GuildSettings {
    id: number | string;
    guild_id: string;
    guild_name: string;
    time_zone: string | null;
    total_focus_minutes: number;
    global_buddy_matching_enabled: number | boolean;
    study_hub_accepts_guests: number | boolean;
}
export interface GuildRepository {
    getOrCreateSettings(guildId: string, guildName?: string | null, ctx?: TransactionContext): Promise<GuildSettings>;
    updateGuildScore(guildId: string, guildName: string | null, minutes: number, ctx?: TransactionContext): Promise<void>;
    recordQuestProgress(guildId: string, userId: string, minutes: number, sourceType: string, sourceId: string, ctx?: TransactionContext): Promise<void>;
}
