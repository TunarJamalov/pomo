import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Note, NoteRepository } from './note-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresNoteRepository implements NoteRepository {
    private db;
    constructor(db: NodePgDatabase<any>);
    private getDb;
    createNote(userId: string, title: string, contentRich?: string, subjectId?: string, ctx?: TransactionContext): Promise<Note>;
    getNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<Note | null>;
    listNotes(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Note[]>;
    updateNote(userId: string, noteId: string, updates: Partial<Pick<Note, 'title' | 'content_rich' | 'subject_id'>>, ctx?: TransactionContext): Promise<Note | null>;
    deleteNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<boolean>;
}
