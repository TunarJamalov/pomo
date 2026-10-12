import { eq, sql } from 'drizzle-orm';
import * as schema from '../schema';
import { MarketPrice, MarketRepository } from './market-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresMarketRepository implements MarketRepository {
    constructor(private db: any) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async getMarketPrices(ctx?: TransactionContext): Promise<MarketPrice[]> {
        const prices = await this.getDb(ctx)
            .select()
            .from(schema.market_prices);
            
        return prices.map((p: any) => this.mapMarketPrice(p));
    }

    async getMarketPrice(itemKey: string, ctx?: TransactionContext): Promise<MarketPrice | null> {
        const prices = await this.getDb(ctx)
            .select()
            .from(schema.market_prices)
            .where(eq(schema.market_prices.item_key, itemKey))
            .limit(1);

        if (!prices.length) return null;
        return this.mapMarketPrice(prices[0]);
    }

    async setMarketPrice(itemKey: string, price: number, ctx?: TransactionContext): Promise<void> {
        await this.getDb(ctx)
            .insert(schema.market_prices)
            .values({
                item_key: itemKey,
                price
            })
            .onConflictDoUpdate({
                target: schema.market_prices.item_key,
                set: {
                    price,
                    updated_at: sql`now()`
                }
            });
    }

    private mapMarketPrice(row: any): MarketPrice {
        return {
            item_key: row.item_key,
            price: row.price,
            updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || '')
        };
    }
}
