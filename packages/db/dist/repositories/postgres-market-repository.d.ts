import { MarketPrice, MarketRepository } from './market-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresMarketRepository implements MarketRepository {
    private db;
    constructor(db: any);
    private getDb;
    getMarketPrices(ctx?: TransactionContext): Promise<MarketPrice[]>;
    getMarketPrice(itemKey: string, ctx?: TransactionContext): Promise<MarketPrice | null>;
    setMarketPrice(itemKey: string, price: number, ctx?: TransactionContext): Promise<void>;
    private mapMarketPrice;
}
