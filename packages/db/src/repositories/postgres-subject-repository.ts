import { eq, and } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Subject, SubjectRepository } from './subject-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { subjects } from '../schema/productivity';

export class PostgresSubjectRepository implements SubjectRepository {
    constructor(private db: NodePgDatabase<any>) {}

    private getDb(ctx?: TransactionContext) {
        return ctx?.db || this.db;
    }

    async createSubject(userId: string, name: string, color?: string, ctx?: TransactionContext): Promise<Subject> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(subjects).values({
            user_id: userId,
            name,
            color: color || '#3B82F6',
        }).returning();

        return result as Subject;
    }

    async getSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<Subject | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(subjects)
            .where(and(eq(subjects.id, subjectId), eq(subjects.user_id, userId)));
        return (result as Subject) || null;
    }

    async listSubjects(userId: string, ctx?: TransactionContext): Promise<Subject[]> {
        const dbClient = this.getDb(ctx);
        const results = await dbClient.select()
            .from(subjects)
            .where(eq(subjects.user_id, userId));
        return results as Subject[];
    }

    async updateSubject(userId: string, subjectId: string, updates: Partial<Pick<Subject, 'name' | 'color'>>, ctx?: TransactionContext): Promise<Subject | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.update(subjects)
            .set(updates)
            .where(and(eq(subjects.id, subjectId), eq(subjects.user_id, userId)))
            .returning();
        return (result as Subject) || null;
    }

    async deleteSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(subjects)
            .where(and(eq(subjects.id, subjectId), eq(subjects.user_id, userId)))
            .returning({ id: subjects.id });
        return result.length > 0;
    }
}
