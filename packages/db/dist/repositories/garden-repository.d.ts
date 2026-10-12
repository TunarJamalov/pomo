import { TransactionContext } from '../transaction/transaction-manager';
export interface GardenPlot {
    id: string | number;
    user_id: string;
    plant_type: string;
    stage: number;
    water_used: number;
    planted_at: string;
    last_watered: string | null;
}
export interface GardenRepository {
    getPlots(userId: string, ctx?: TransactionContext): Promise<GardenPlot[]>;
    getPlot(plotId: string | number, userId: string, ctx?: TransactionContext): Promise<GardenPlot | null>;
    plantSeed(userId: string, plantType: string, ctx?: TransactionContext): Promise<void>;
    updatePlot(plotId: string | number, waterUsed: number, stage: number, ctx?: TransactionContext): Promise<void>;
    removePlot(plotId: string | number, ctx?: TransactionContext): Promise<boolean>;
    logHarvest(userId: string, plantType: string, ctx?: TransactionContext): Promise<void>;
}
