import { eq, sql, desc, and } from 'drizzle-orm';
import * as schema from '../schema';
import { Season, SeasonRepository } from './season-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresSeasonRepository implements SeasonRepository {
    constructor(private db: any, private identityRepository: IdentityRepository) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async getActiveSeason(ctx?: TransactionContext): Promise<Season | null> {
        const seasons = await this.getDb(ctx)
            .select()
            .from(schema.seasons)
            .where(eq(schema.seasons.is_active, true))
            .limit(1);

        if (!seasons.length) return null;
        return this.mapSeason(seasons[0]);
    }

    async startNewSeason(name: string, ctx?: TransactionContext): Promise<Season> {
        // End active season
        await this.getDb(ctx)
            .update(schema.seasons)
            .set({ is_active: false, ended_at: sql`now()` })
            .where(eq(schema.seasons.is_active, true));

        // Start new season
        const [season] = await this.getDb(ctx)
            .insert(schema.seasons)
            .values({
                name,
                is_active: true
            })
            .returning();

        // Reset all season data
        await this.getDb(ctx)
            .update(schema.users)
            .set({
                season_xp: 0,
                season_focus_minutes: 0
            });

        await this.getDb(ctx)
            .update(schema.clans)
            .set({ season_xp: 0 });

        await this.getDb(ctx)
            .update(schema.guild_progress)
            .set({ season_xp: 0 });

        return this.mapSeason(season);
    }

    async getSeasonLeaderboard(limit: number = 100, ctx?: TransactionContext): Promise<{ discord_id: string; season_xp: number; season_focus_minutes: number; level: number; }[]> {
        const usersList = await this.getDb(ctx)
            .select()
            .from(schema.users)
            .where(sql`season_xp > 0`)
            .orderBy(desc(schema.users.season_xp))
            .limit(limit);

        const results = [];
        for (const u of usersList) {
            const discordId = await this.identityRepository.getIdentity(u.id, 'discord', ctx);
            if (discordId) {
                results.push({
                    discord_id: discordId,
                    season_xp: u.season_xp || 0,
                    season_focus_minutes: u.season_focus_minutes || 0,
                    level: u.level || 1
                });
            }
        }
        
        return results;
    }

    private mapSeason(row: any): Season {
        return {
            id: row.id,
            name: row.name,
            is_active: row.is_active,
            started_at: row.started_at instanceof Date ? row.started_at.toISOString() : (row.started_at || ''),
            ended_at: row.ended_at instanceof Date ? row.ended_at.toISOString() : row.ended_at
        };
    }
}
