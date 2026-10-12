import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Note, NoteRepository } from './note-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { notes } from '../schema/productivity';

export class PostgresNoteRepository implements NoteRepository {
    constructor(private db: NodePgDatabase<any>) {}

    private getDb(ctx?: TransactionContext) {
        return ctx?.db || this.db;
    }

    async createNote(userId: string, title: string, contentRich?: string, subjectId?: string, ctx?: TransactionContext): Promise<Note> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(notes).values({
            user_id: userId,
            title,
            content_rich: contentRich || '',
            subject_id: subjectId || null,
        }).returning();

        return result as Note;
    }

    async getNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<Note | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)));
        return (result as Note) || null;
    }

    async listNotes(userId: string, subjectId?: string, ctx?: TransactionContext): Promise<Note[]> {
        const dbClient = this.getDb(ctx);
        let query = dbClient.select().from(notes).where(eq(notes.user_id, userId));
        
        if (subjectId) {
            query = dbClient.select().from(notes).where(and(eq(notes.user_id, userId), eq(notes.subject_id, subjectId)));
        }
        
        const results = await query;
        return results as Note[];
    }

    async updateNote(userId: string, noteId: string, updates: Partial<Pick<Note, 'title' | 'content_rich' | 'subject_id'>>, ctx?: TransactionContext): Promise<Note | null> {
        const dbClient = this.getDb(ctx);
        const updateData: any = { ...updates, updated_at: new Date().toISOString() }; // Optional updated_at if not handled by db trigger

        const [result] = await dbClient.update(notes)
            .set(updateData)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)))
            .returning();
        return (result as Note) || null;
    }

    async deleteNote(userId: string, noteId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(notes)
            .where(and(eq(notes.id, noteId), eq(notes.user_id, userId)))
            .returning({ id: notes.id });
        return result.length > 0;
    }
}
