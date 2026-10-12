import { GardenRepository, GardenPlot } from './garden-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteGardenRepository implements GardenRepository {
    private db;
    private identityRepo;
    constructor(db: any, identityRepo: IdentityRepository);
    getPlots(userId: string, ctx?: TransactionContext): Promise<GardenPlot[]>;
    getPlot(plotId: string | number, userId: string, ctx?: TransactionContext): Promise<GardenPlot | null>;
    plantSeed(userId: string, plantType: string, ctx?: TransactionContext): Promise<void>;
    updatePlot(plotId: string | number, waterUsed: number, stage: number, ctx?: TransactionContext): Promise<void>;
    removePlot(plotId: string | number, ctx?: TransactionContext): Promise<boolean>;
    logHarvest(userId: string, plantType: string, ctx?: TransactionContext): Promise<void>;
}
