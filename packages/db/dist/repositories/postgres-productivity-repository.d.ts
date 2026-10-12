import { ProductivityRepository, Task, CreateTaskOptions } from './productivity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresProductivityRepository implements ProductivityRepository {
    private db;
    constructor(db: any);
    private mapTask;
    createTask(userId: string, content: string, options?: CreateTaskOptions, ctx?: TransactionContext): Promise<{
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
