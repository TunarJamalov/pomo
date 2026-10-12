import { InventoryRepository, InventoryItem } from './inventory-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqliteInventoryRepository implements InventoryRepository {
    constructor(private db: any, private identityRepo: IdentityRepository) {}

    async getItem(userId: string, itemKey: string, ctx?: TransactionContext): Promise<InventoryItem | null> {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const row = (ctx?.db || this.db).prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        return row ? { ...row, user_id: userId } : null;
    }

    async addItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<void> {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const db = ctx?.db || this.db;
        const existing = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (existing) {
            db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
        } else {
            db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, ?)').run(userId, itemKey, quantity);
        }
    }

    async listItems(userId: string, ctx?: TransactionContext): Promise<InventoryItem[]> {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const rows = (ctx?.db || this.db).prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
        return rows.map((r: any) => ({ ...r, user_id: userId }));
    }

    async removeItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<boolean> {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const db = ctx?.db || this.db;
        const existing = db.prepare('SELECT id, quantity FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (!existing || existing.quantity < quantity) {
            return false;
        }
        
        if (existing.quantity === quantity) {
            db.prepare('DELETE FROM inventory WHERE id = ?').run(existing.id);
        } else {
            db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, existing.id);
        }
        return true;
    }
}
