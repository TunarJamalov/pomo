"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresUserRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const users_1 = require("../schema/users");
class PostgresUserRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async getUser(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
        return result.length > 0 ? result[0] : null;
    }
    async updateUser(userId, updates, ctx) {
        const dbClient = ctx?.db || this.db;
        const keys = Object.keys(updates);
        if (keys.length === 0)
            return;
        await dbClient.update(users_1.users).set(updates).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    }
    async incrementField(userId, field, amount, ctx) {
        const dbClient = ctx?.db || this.db;
        let updates = {};
        updates[field] = (0, drizzle_orm_1.sql) `${users_1.users[field]} + ${amount}`;
        if (field === 'xp') {
            updates.season_xp = (0, drizzle_orm_1.sql) `${users_1.users.season_xp} + ${amount}`;
        }
        else if (field === 'total_focus_minutes') {
            updates.season_focus_minutes = (0, drizzle_orm_1.sql) `${users_1.users.season_focus_minutes} + ${amount}`;
        }
        await dbClient.update(users_1.users).set(updates).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    }
    async deductWaterAtomic(userId, amount, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(users_1.users)
            .set({ water: (0, drizzle_orm_1.sql) `${users_1.users.water} - ${amount}` })
            .where((0, drizzle_orm_1.sql) `${users_1.users.id} = ${userId} AND ${users_1.users.water} >= ${amount}`)
            .returning({ id: users_1.users.id });
        return result.length > 0;
    }
    async getReferralCount(userId, ctx) {
        const dbClient = ctx?.db || this.db;
        // In PostgreSQL schema, referred_by is a UUID
        const result = await dbClient.select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(users_1.users)
            .where((0, drizzle_orm_1.eq)(users_1.users.referred_by, userId));
        return Number(result[0]?.count || 0);
    }
    async setReferral(userId, referrerUserId, ctx) {
        const dbClient = ctx?.db || this.db;
        if (userId === referrerUserId) {
            return { success: false, reason: 'self_referral' };
        }
        const user = await this.getUser(userId, ctx);
        if (!user)
            return { success: false, reason: 'user_not_found' };
        if (user.referred_by)
            return { success: false, reason: 'already_referred' };
        const referrer = await this.getUser(referrerUserId, ctx);
        if (!referrer)
            return { success: false, reason: 'invalid_referrer' };
        await dbClient.update(users_1.users)
            .set({ referred_by: referrerUserId })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
        return { success: true };
    }
}
exports.PostgresUserRepository = PostgresUserRepository;
