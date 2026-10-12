import { Database } from 'better-sqlite3';
import { MarketPrice, MarketRepository } from './market-repository';

export class SqliteMarketRepository implements MarketRepository {
    constructor(private db: Database) {}

    async getMarketPrices(): Promise<MarketPrice[]> {
        return this.db.prepare("SELECT * FROM market_prices").all() as MarketPrice[];
    }

    async getMarketPrice(itemKey: string): Promise<MarketPrice | null> {
        return this.db.prepare("SELECT * FROM market_prices WHERE item_key = ?").get(itemKey) as MarketPrice | null;
    }

    async setMarketPrice(itemKey: string, price: number): Promise<void> {
        this.db.prepare(`
            INSERT INTO market_prices (item_key, price)
            VALUES (?, ?)
            ON CONFLICT(item_key) DO UPDATE SET
                price = excluded.price,
                updated_at = datetime('now')
        `).run(itemKey, price);
    }
}
