import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Document, DocumentRepository } from './document-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { documents } from '../schema/productivity';

export class PostgresDocumentRepository implements DocumentRepository {
    constructor(private db: NodePgDatabase<any>) {}

    private getDb(ctx?: TransactionContext) {
        return ctx?.db || this.db;
    }

    async createDocument(userId: string, title: string, filePath: string, fileType?: string, sizeBytes?: number, subjectId?: string, ctx?: TransactionContext): Promise<Document> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(documents).values({
            user_id: userId,
            title,
            file_path: filePath,
            file_type: fileType || 'pdf',
            size_bytes: sizeBytes || 0,
            subject_id: subjectId || null,
        }).returning();

        return result as Document;
    }

    async getDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<Document | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(documents)
            .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)));
        return (result as Document) || null;
    }

    async listDocuments(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Document[]> {
        const dbClient = this.getDb(ctx);
        let query = dbClient.select().from(documents).where(eq(documents.user_id, userId));
        
        if (subjectId) {
            query = dbClient.select().from(documents).where(and(eq(documents.user_id, userId), eq(documents.subject_id, subjectId)));
        }
        
        const results = await query;
        return results as Document[];
    }

    async deleteDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(documents)
            .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
            .returning({ id: documents.id });
        return result.length > 0;
    }
}
