import { TransactionContext } from '../transaction/transaction-manager';

export interface Note {
    id: string;
    user_id: string;
    subject_id: string | null;
    title: string;
    content_rich: string | null;
    created_at: string;
    updated_at: string;
}

export interface NoteRepository {
    createNote(userId: string, title: string, contentRich?: string, subjectId?: string, ctx?: TransactionContext): Promise<Note>;
    getNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<Note | null>;
    listNotes(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Note[]>;
    updateNote(userId: string, noteId: string, updates: Partial<Pick<Note, 'title' | 'content_rich' | 'subject_id'>>, ctx?: TransactionContext): Promise<Note | null>;
    deleteNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<boolean>;
}
