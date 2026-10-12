"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresGoalRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const productivity_1 = require("../schema/productivity");
class PostgresGoalRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.db || this.db;
    }
    async createGoal(userId, type, targetValue, deadline, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(productivity_1.goals).values({
            user_id: userId,
            type,
            target_value: targetValue,
            current_value: 0,
            deadline: deadline || null,
        }).returning();
        return result;
    }
    async getGoal(userId, goalId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(productivity_1.goals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.goals.id, goalId), (0, drizzle_orm_1.eq)(productivity_1.goals.user_id, userId)));
        return result || null;
    }
    async listGoals(userId, ctx) {
        const dbClient = this.getDb(ctx);
        const results = await dbClient.select()
            .from(productivity_1.goals)
            .where((0, drizzle_orm_1.eq)(productivity_1.goals.user_id, userId));
        return results;
    }
    async updateGoalProgress(userId, goalId, incrementValue, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.update(productivity_1.goals)
            .set({ current_value: (0, drizzle_orm_1.sql) `${productivity_1.goals.current_value} + ${incrementValue}` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.goals.id, goalId), (0, drizzle_orm_1.eq)(productivity_1.goals.user_id, userId)))
            .returning();
        return result || null;
    }
    async deleteGoal(userId, goalId, ctx) {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(productivity_1.goals)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.goals.id, goalId), (0, drizzle_orm_1.eq)(productivity_1.goals.user_id, userId)))
            .returning({ id: productivity_1.goals.id });
        return result.length > 0;
    }
}
exports.PostgresGoalRepository = PostgresGoalRepository;
