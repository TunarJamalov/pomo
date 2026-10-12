import { TransactionContext } from '../transaction/transaction-manager';
export interface Subject {
    id: string;
    user_id: string;
    name: string;
    color: string | null;
    created_at: string;
}
export interface SubjectRepository {
    createSubject(userId: string, name: string, color?: string, ctx?: TransactionContext): Promise<Subject>;
    getSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<Subject | null>;
    listSubjects(userId: string, ctx?: TransactionContext): Promise<Subject[]>;
    updateSubject(userId: string, subjectId: string, updates: Partial<Pick<Subject, 'name' | 'color'>>, ctx?: TransactionContext): Promise<Subject | null>;
    deleteSubject(userId: string, subjectId: string, ctx?: TransactionContext): Promise<boolean>;
}
