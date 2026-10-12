import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Subject, SubjectRepository } from './subject-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresSubjectRepository implements SubjectRepository {
    private db;
    constructor(db: NodePgDatabase<any>);
    private getDb;
    createSubject(userId: string, name: string, color?: string, ctx?: TransactionContext): Promise<Subject>;
    getSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<Subject | null>;
    listSubjects(userId: string, ctx?: TransactionContext): Promise<Subject[]>;
    updateSubject(userId: string, subjectId: string, updates: Partial<Pick<Subject, 'name' | 'color'>>, ctx?: TransactionContext): Promise<Subject | null>;
    deleteSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<boolean>;
}
