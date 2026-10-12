import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Document, DocumentRepository } from './document-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresDocumentRepository implements DocumentRepository {
    private db;
    constructor(db: NodePgDatabase<any>);
    private getDb;
    createDocument(userId: string, title: string, filePath: string, fileType?: string, sizeBytes?: number, subjectId?: string, ctx?: TransactionContext): Promise<Document>;
    getDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<Document | null>;
    listDocuments(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Document[]>;
    deleteDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<boolean>;
}
