import { InventoryRepository, InventoryItem } from './inventory-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, sql } from 'drizzle-orm';
import { inventory } from '../schema/gamification';

export class PostgresInventoryRepository implements InventoryRepository {
    constructor(private db: any) {}

    private mapItem(row: any): InventoryItem {
        return {
            id: row.id,
            user_id: row.user_id,
            item_key: row.item_key,
            quantity: row.quantity
        };
    }

    async getItem(userId: string, itemKey: string, ctx?: TransactionContext): Promise<InventoryItem | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(inventory)
            .where(and(eq(inventory.user_id, userId), eq(inventory.item_key, itemKey)))
            .limit(1);
            
        return result.length > 0 ? this.mapItem(result[0]) : null;
    }

    async addItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        
        await dbClient.insert(inventory)
            .values({
                user_id: userId,
                item_key: itemKey,
                quantity: quantity
            })
            .onConflictDoUpdate({
                target: [inventory.user_id, inventory.item_key],
                set: { quantity: sql`${inventory.quantity} + ${quantity}` }
            });
    }

    async removeItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        
        const result = await dbClient.update(inventory)
            .set({ quantity: sql`${inventory.quantity} - ${quantity}` })
            .where(and(
                eq(inventory.user_id, userId),
                eq(inventory.item_key, itemKey),
                sql`${inventory.quantity} >= ${quantity}`
            ))
            .returning({ id: inventory.id });
            
        if (result.length > 0) {
            // Cleanup zero quantity items
            await dbClient.delete(inventory)
                .where(and(
                    eq(inventory.user_id, userId),
                    eq(inventory.item_key, itemKey),
                    eq(inventory.quantity, 0)
                ));
            return true;
        }
        
        return false;
    }

    async listItems(userId: string, ctx?: TransactionContext): Promise<InventoryItem[]> {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select()
            .from(inventory)
            .where(eq(inventory.user_id, userId));
            
        return rows.map((r: any) => this.mapItem(r));
    }
}
