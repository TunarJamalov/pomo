"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteMarketRepository = void 0;
class SqliteMarketRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getMarketPrices() {
        return this.db.prepare("SELECT * FROM market_prices").all();
    }
    async getMarketPrice(itemKey) {
        return this.db.prepare("SELECT * FROM market_prices WHERE item_key = ?").get(itemKey);
    }
    async setMarketPrice(itemKey, price) {
        this.db.prepare(`
            INSERT INTO market_prices (item_key, price)
            VALUES (?, ?)
            ON CONFLICT(item_key) DO UPDATE SET
                price = excluded.price,
                updated_at = datetime('now')
        `).run(itemKey, price);
    }
}
exports.SqliteMarketRepository = SqliteMarketRepository;
