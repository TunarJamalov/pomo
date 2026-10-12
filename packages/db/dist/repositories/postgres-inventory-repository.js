"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresInventoryRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const gamification_1 = require("../schema/gamification");
class PostgresInventoryRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapItem(row) {
        return {
            id: row.id,
            user_id: row.user_id,
            item_key: row.item_key,
            quantity: row.quantity
        };
    }
    async getItem(userId, itemKey, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(gamification_1.inventory)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.inventory.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.inventory.item_key, itemKey)))
            .limit(1);
        return result.length > 0 ? this.mapItem(result[0]) : null;
    }
    async addItem(userId, itemKey, quantity, ctx) {
        const dbClient = ctx?.db || this.db;
        await dbClient.insert(gamification_1.inventory)
            .values({
            user_id: userId,
            item_key: itemKey,
            quantity: quantity
        })
            .onConflictDoUpdate({
            target: [gamification_1.inventory.user_id, gamification_1.inventory.item_key],
            set: { quantity: (0, drizzle_orm_1.sql) `${gamification_1.inventory.quantity} + ${quantity}` }
        });
    }
    async removeItem(userId, itemKey, quantity, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(gamification_1.inventory)
            .set({ quantity: (0, drizzle_orm_1.sql) `${gamification_1.inventory.quantity} - ${quantity}` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.inventory.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.inventory.item_key, itemKey), (0, drizzle_orm_1.sql) `${gamification_1.inventory.quantity} >= ${quantity}`))
            .returning({ id: gamification_1.inventory.id });
        if (result.length > 0) {
            // Cleanup zero quantity items
            await dbClient.delete(gamification_1.inventory)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(gamification_1.inventory.user_id, userId), (0, drizzle_orm_1.eq)(gamification_1.inventory.item_key, itemKey), (0, drizzle_orm_1.eq)(gamification_1.inventory.quantity, 0)));
            return true;
        }
        return false;
    }
    async listItems(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const rows = await dbClient.select()
            .from(gamification_1.inventory)
            .where((0, drizzle_orm_1.eq)(gamification_1.inventory.user_id, userId));
        return rows.map((r) => this.mapItem(r));
    }
}
exports.PostgresInventoryRepository = PostgresInventoryRepository;
