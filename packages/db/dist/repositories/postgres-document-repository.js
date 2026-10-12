"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresDocumentRepository = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const productivity_1 = require("../schema/productivity");
class PostgresDocumentRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    getDb(ctx) {
        return ctx?.db || this.db;
    }
    async createDocument(userId, title, filePath, fileType, sizeBytes, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(productivity_1.documents).values({
            user_id: userId,
            title,
            file_path: filePath,
            file_type: fileType || 'pdf',
            size_bytes: sizeBytes || 0,
            subject_id: subjectId || null,
        }).returning();
        return result;
    }
    async getDocument(userId, documentId, ctx) {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(productivity_1.documents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.documents.id, documentId), (0, drizzle_orm_1.eq)(productivity_1.documents.user_id, userId)));
        return result || null;
    }
    async listDocuments(userId, subjectId, ctx) {
        const dbClient = this.getDb(ctx);
        let query = dbClient.select().from(productivity_1.documents).where((0, drizzle_orm_1.eq)(productivity_1.documents.user_id, userId));
        if (subjectId) {
            query = dbClient.select().from(productivity_1.documents).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.documents.user_id, userId), (0, drizzle_orm_1.eq)(productivity_1.documents.subject_id, subjectId)));
        }
        const results = await query;
        return results;
    }
    async deleteDocument(userId, documentId, ctx) {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(productivity_1.documents)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(productivity_1.documents.id, documentId), (0, drizzle_orm_1.eq)(productivity_1.documents.user_id, userId)))
            .returning({ id: productivity_1.documents.id });
        return result.length > 0;
    }
}
exports.PostgresDocumentRepository = PostgresDocumentRepository;
