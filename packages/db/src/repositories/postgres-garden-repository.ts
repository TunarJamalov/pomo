import { GardenRepository, GardenPlot } from './garden-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, sql } from 'drizzle-orm';
import { garden_plots, harvested_items } from '../schema/gamification';

export class PostgresGardenRepository implements GardenRepository {
    constructor(private db: any) {}

    private mapPlot(row: any): GardenPlot {
        return {
            id: String(row.id),
            user_id: row.user_id,
            plant_type: row.plant_type,
            stage: row.stage || 0,
            water_used: row.water_used || 0,
            planted_at: row.planted_at,
            last_watered: row.last_watered
        };
    }

    async getPlots(userId: string, ctx?: TransactionContext): Promise<GardenPlot[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select().from(garden_plots).where(eq(garden_plots.user_id, userId));
        return rows.map((r: any) => this.mapPlot(r));
    }

    async getPlot(plotId: string | number, userId: string, ctx?: TransactionContext): Promise<GardenPlot | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(garden_plots)
            .where(and(eq(garden_plots.id, String(plotId)), eq(garden_plots.user_id, userId)))
            .limit(1);
        return result.length > 0 ? this.mapPlot(result[0]) : null;
    }

    async plantSeed(userId: string, plantType: string, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(garden_plots).values({
            user_id: userId,
            plant_type: plantType,
            stage: 0,
            water_used: 0
        });
    }

    async updatePlot(plotId: string | number, waterUsed: number, stage: number, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        await dbClient.update(garden_plots)
            .set({ 
                water_used: waterUsed, 
                stage: stage, 
                last_watered: sql`CURRENT_TIMESTAMP` 
            })
            .where(eq(garden_plots.id, String(plotId)));
    }

    async removePlot(plotId: string | number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(garden_plots)
            .where(eq(garden_plots.id, String(plotId)))
            .returning({ id: garden_plots.id });
        return result.length > 0;
    }

    async logHarvest(userId: string, plantType: string, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(harvested_items).values({
            user_id: userId,
            plant_type: plantType
        });
    }
}
