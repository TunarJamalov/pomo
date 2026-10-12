import { TransactionContext } from '../transaction/transaction-manager';

export interface Document {
    id: string;
    user_id: string;
    subject_id: string | null;
    title: string;
    file_path: string;
    file_type: string | null;
    size_bytes: number | null;
    created_at: string;
}

export interface DocumentRepository {
    createDocument(userId: string, title: string, filePath: string, fileType?: string, sizeBytes?: number, subjectId?: string, ctx?: TransactionContext): Promise<Document>;
    getDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<Document | null>;
    listDocuments(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Document[]>;
    deleteDocument(userId: string, documentId: string, ctx?: TransactionContext): Promise<boolean>;
}
