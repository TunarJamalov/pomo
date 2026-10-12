import { Database } from 'better-sqlite3';
import { MarketPrice, MarketRepository } from './market-repository';
export declare class SqliteMarketRepository implements MarketRepository {
    private db;
    constructor(db: Database);
    getMarketPrices(): Promise<MarketPrice[]>;
    getMarketPrice(itemKey: string): Promise<MarketPrice | null>;
    setMarketPrice(itemKey: string, price: number): Promise<void>;
}
