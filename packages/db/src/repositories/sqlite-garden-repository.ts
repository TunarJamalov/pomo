import { GardenRepository, GardenPlot } from './garden-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqliteGardenRepository implements GardenRepository {
    constructor(private db: any, private identityRepo: IdentityRepository) {}

    async getPlots(userId: string, ctx?: TransactionContext): Promise<GardenPlot[]> {
        // Legacy sqlite tables key garden rows by discord id directly.
        const rows = (ctx?.db || this.db).prepare('SELECT * FROM garden_plots WHERE user_id = ? ORDER BY id').all(userId);
        return rows.map((r: any) => ({ ...r, user_id: userId }));
    }

    async getPlot(plotId: string | number, userId: string, ctx?: TransactionContext): Promise<GardenPlot | null> {
        // Legacy sqlite tables key garden rows by discord id directly.
        const row = (ctx?.db || this.db).prepare('SELECT * FROM garden_plots WHERE id = ? AND user_id = ?').get(Number(plotId), userId);
        return row ? { ...row, user_id: userId } : null;
    }

    async plantSeed(userId: string, plantType: string, ctx?: TransactionContext): Promise<void> {
        // Legacy sqlite tables key garden rows by discord id directly.
        (ctx?.db || this.db).prepare(
            "INSERT INTO garden_plots (user_id, plant_type, stage, water_used, planted_at) VALUES (?, ?, 0, 0, datetime('now'))"
        ).run(userId, plantType);
    }

    async updatePlot(plotId: string | number, waterUsed: number, stage: number, ctx?: TransactionContext): Promise<void> {
        (ctx?.db || this.db).prepare(
            "UPDATE garden_plots SET water_used = ?, stage = ?, last_watered = datetime('now') WHERE id = ?"
        ).run(waterUsed, stage, Number(plotId));
    }

    async removePlot(plotId: string | number, ctx?: TransactionContext): Promise<boolean> {
        const info = (ctx?.db || this.db).prepare('DELETE FROM garden_plots WHERE id = ?').run(Number(plotId));
        return info.changes > 0;
    }

    async logHarvest(userId: string, plantType: string, ctx?: TransactionContext): Promise<void> {
        // Legacy sqlite tables key harvest rows by discord id directly.
        (ctx?.db || this.db).prepare('INSERT INTO harvested_items (user_id, plant_type) VALUES (?, ?)').run(userId, plantType);
    }
}
