import { eq, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { GuildSettings, GuildRepository } from './guild-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresGuildRepository implements GuildRepository {
    constructor(private db: any) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async getOrCreateSettings(guildId: string, guildName?: string | null, ctx?: TransactionContext): Promise<GuildSettings> {
        const existing = await this.getDb(ctx)
            .select()
            .from(schema.guild_settings)
            .where(eq(schema.guild_settings.guild_id, guildId))
            .limit(1);

        if (existing.length) {
            if (guildName && existing[0].guild_name !== guildName) {
                await this.getDb(ctx)
                    .update(schema.guild_settings)
                    .set({ guild_name: guildName })
                    .where(eq(schema.guild_settings.guild_id, guildId));
                existing[0].guild_name = guildName;
            }
            return existing[0] as GuildSettings;
        }

        const [newSettings] = await this.getDb(ctx)
            .insert(schema.guild_settings)
            .values({
                guild_id: guildId,
                guild_name: guildName || null
            })
            .returning();
            
        return newSettings as GuildSettings;
    }

    async updateGuildScore(guildId: string, guildName: string | null, minutes: number, ctx?: TransactionContext): Promise<void> {
        await this.getOrCreateSettings(guildId, guildName, ctx);
        
        const updateData: any = {
            total_focus_minutes: sql`total_focus_minutes + ${minutes}`
        };
        if (guildName) {
            updateData.guild_name = guildName;
        }

        await this.getDb(ctx)
            .update(schema.guild_settings)
            .set(updateData)
            .where(eq(schema.guild_settings.guild_id, guildId));
    }

    async recordQuestProgress(guildId: string, userId: string, minutes: number, sourceType: string, sourceId: string, ctx?: TransactionContext): Promise<void> {
        // In Postgres, guild_quests/guild_quest_contributions are tracked differently.
        // For now, we ensure the guild exists. Full quest logic can be added when quest schema is migrated.
        await this.getOrCreateSettings(guildId, null, ctx);
    }
}
