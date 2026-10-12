"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresSubjectRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const productivity_1 = require("../schema/productivity");
class PostgresSubjectRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.db || this.db;
    }
    async createSubject(userId, name, color, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(productivity_1.subjects).values({
            user_id: userId,
            name,
            color: color || '#3B82F6',
        }).returning();
        return result;
    }
    async getSubject(userId, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(productivity_1.subjects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.subjects.id, subjectId), (0, drizzle_orm_1.eq)(productivity_1.subjects.user_id, userId)));
        return result || null;
    }
    async listSubjects(userId, ctx) {
        const dbClient = this.getDb(ctx);
        const results = await dbClient.select()
            .from(productivity_1.subjects)
            .where((0, drizzle_orm_1.eq)(productivity_1.subjects.user_id, userId));
        return results;
    }
    async updateSubject(userId, subjectId, updates, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.update(productivity_1.subjects)
            .set(updates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.subjects.id, subjectId), (0, drizzle_orm_1.eq)(productivity_1.subjects.user_id, userId)))
            .returning();
        return result || null;
    }
    async deleteSubject(userId, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(productivity_1.subjects)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.subjects.id, subjectId), (0, drizzle_orm_1.eq)(productivity_1.subjects.user_id, userId)))
            .returning({ id: productivity_1.subjects.id });
        return result.length > 0;
    }
}
exports.PostgresSubjectRepository = PostgresSubjectRepository;
