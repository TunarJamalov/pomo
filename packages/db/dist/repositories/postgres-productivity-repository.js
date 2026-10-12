"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresProductivityRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const productivity_1 = require("../schema/productivity");
class PostgresProductivityRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    mapTask(row) {
        return {
            id: String(row.id),
            content: row.content,
            completed: Boolean(row.completed),
            focus_minutes: row.focus_minutes || 0,
            subject_id: row.subject_id,
            priority: row.priority,
            deadline: row.deadline,
            created_at: row.created_at,
            completed_at: row.completed_at
        };
    }
    async createTask(userId, content, options, ctx) {
        const dbClient = ctx?.db || this.db;
        const activeCount = await dbClient.select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
            .from(productivity_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId), (0, drizzle_orm_1.eq)(productivity_1.tasks.completed, false)));
        if (Number(activeCount[0]?.count || 0) >= 50) {
            return { success: false, reason: 'limit_reached' };
        }
        const result = await dbClient.insert(productivity_1.tasks)
            .values({
            user_id: userId,
            content: content,
            completed: false,
            focus_minutes: 0,
            subject_id: options?.subjectId || null,
            priority: options?.priority || 'medium',
            deadline: options?.deadline || null,
        })
            .returning();
        return { success: true, task: this.mapTask(result[0]) };
    }
    async completeTask(userId, taskId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(productivity_1.tasks)
            .set({ completed: true, completed_at: (0, drizzle_orm_1.sql) `CURRENT_TIMESTAMP` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId)))
            .returning({ id: productivity_1.tasks.id });
        return result.length > 0;
    }
    async uncompleteTask(userId, taskId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(productivity_1.tasks)
            .set({ completed: false, completed_at: null })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId)))
            .returning({ id: productivity_1.tasks.id });
        return result.length > 0;
    }
    async deleteTask(userId, taskId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(productivity_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId)))
            .returning({ id: productivity_1.tasks.id });
        return result.length > 0;
    }
    async listTasks(userId, activeOnly = false, ctx) {
        const dbClient = ctx?.db || this.db;
        let query = dbClient.select().from(productivity_1.tasks).where((0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId));
        if (activeOnly) {
            query = dbClient.select().from(productivity_1.tasks).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId), (0, drizzle_orm_1.eq)(productivity_1.tasks.completed, false)));
        }
        const rows = await query;
        return rows.map((r) => this.mapTask(r));
    }
    async getTask(userId, taskId, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(productivity_1.tasks)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId)))
            .limit(1);
        return result.length > 0 ? this.mapTask(result[0]) : null;
    }
    async addFocusMinutesToTask(userId, taskId, minutes, ctx) {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(productivity_1.tasks)
            .set({ focus_minutes: (0, drizzle_orm_1.sql) `${productivity_1.tasks.focus_minutes} + ${minutes}` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.tasks.id, taskId), (0, drizzle_orm_1.eq)(productivity_1.tasks.user_id, userId)))
            .returning({ id: productivity_1.tasks.id });
        return result.length > 0;
    }
}
exports.PostgresProductivityRepository = PostgresProductivityRepository;
