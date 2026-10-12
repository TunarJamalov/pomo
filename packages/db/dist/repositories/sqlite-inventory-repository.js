"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteInventoryRepository = void 0;
class SqliteInventoryRepository {
    db;
    identityRepo;
    constructor(db, identityRepo) {
        this.db = db;
        this.identityRepo = identityRepo;
    }
    async getItem(userId, itemKey, ctx) {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const row = (ctx?.db || this.db).prepare('SELECT * FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        return row ? { ...row, user_id: userId } : null;
    }
    async addItem(userId, itemKey, quantity, ctx) {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const db = ctx?.db || this.db;
        const existing = db.prepare('SELECT id FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (existing) {
            db.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').run(quantity, existing.id);
        }
        else {
            db.prepare('INSERT INTO inventory (user_id, item_key, quantity) VALUES (?, ?, ?)').run(userId, itemKey, quantity);
        }
    }
    async listItems(userId, ctx) {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const rows = (ctx?.db || this.db).prepare('SELECT * FROM inventory WHERE user_id = ?').all(userId);
        return rows.map((r) => ({ ...r, user_id: userId }));
    }
    async removeItem(userId, itemKey, quantity, ctx) {
        // Legacy sqlite tables key inventory rows by discord id directly.
        const db = ctx?.db || this.db;
        const existing = db.prepare('SELECT id, quantity FROM inventory WHERE user_id = ? AND item_key = ?').get(userId, itemKey);
        if (!existing || existing.quantity < quantity) {
            return false;
        }
        if (existing.quantity === quantity) {
            db.prepare('DELETE FROM inventory WHERE id = ?').run(existing.id);
        }
        else {
            db.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').run(quantity, existing.id);
        }
        return true;
    }
}
exports.SqliteInventoryRepository = SqliteInventoryRepository;
