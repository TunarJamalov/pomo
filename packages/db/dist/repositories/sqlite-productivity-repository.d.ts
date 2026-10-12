import { ProductivityRepository, Task } from './productivity-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteProductivityRepository implements ProductivityRepository {
    private db;
    private identityRepo;
    constructor(db: any, identityRepo: IdentityRepository);
    private mapRowToTask;
    createTask(userId: string, content: string, options?: any, ctx?: TransactionContext): Promise<{
        success: boolean;
        task?: Task;
        reason?: string;
    }>;
    completeTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    uncompleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    deleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    listTasks(userId: string, activeOnly?: boolean, ctx?: TransactionContext): Promise<Task[]>;
    getTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<Task | null>;
    addFocusMinutesToTask(userId: string, taskId: string, minutes: number, ctx?: TransactionContext): Promise<boolean>;
}
