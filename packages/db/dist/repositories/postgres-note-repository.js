"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresNoteRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const productivity_1 = require("../schema/productivity");
class PostgresNoteRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.db || this.db;
    }
    async createNote(userId, title, contentRich, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(productivity_1.notes).values({
            user_id: userId,
            title,
            content_rich: contentRich || '',
            subject_id: subjectId || null,
        }).returning();
        return result;
    }
    async getNote(userId, noteId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(productivity_1.notes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.notes.id, noteId), (0, drizzle_orm_1.eq)(productivity_1.notes.user_id, userId)));
        return result || null;
    }
    async listNotes(userId, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        let query = dbClient.select().from(productivity_1.notes).where((0, drizzle_orm_1.eq)(productivity_1.notes.user_id, userId));
        if (subjectId) {
            query = dbClient.select().from(productivity_1.notes).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.notes.user_id, userId), (0, drizzle_orm_1.eq)(productivity_1.notes.subject_id, subjectId)));
        }
        const results = await query;
        return results;
    }
    async updateNote(userId, noteId, updates, ctx) {
        const dbClient = this.getDb(ctx);
        const updateData = { ...updates, updated_at: new Date().toISOString() }; // Optional updated_at if not handled by db trigger
        const [result] = await dbClient.update(productivity_1.notes)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.notes.id, noteId), (0, drizzle_orm_1.eq)(productivity_1.notes.user_id, userId)))
            .returning();
        return result || null;
    }
    async deleteNote(userId, noteId, ctx) {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(productivity_1.notes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.notes.id, noteId), (0, drizzle_orm_1.eq)(productivity_1.notes.user_id, userId)))
            .returning({ id: productivity_1.notes.id });
        return result.length > 0;
    }
}
exports.PostgresNoteRepository = PostgresNoteRepository;
