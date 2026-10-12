import { TransactionContext } from '../transaction/transaction-manager';

export interface Task {
    id: string;
    content: string;
    completed: boolean;
    focus_minutes: number;
    subject_id?: string | null;
    priority?: string;
    deadline?: string | null;
    created_at: string;
    completed_at: string | null;
}

export interface CreateTaskOptions {
    subjectId?: string;
    priority?: 'low' | 'medium' | 'high';
    deadline?: string;
}

export interface ProductivityRepository {
    createTask(userId: string, content: string, options?: CreateTaskOptions, ctx?: TransactionContext): Promise<{ success: boolean; task?: Task; reason?: string }>;
    completeTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    uncompleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    deleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean>;
    listTasks(userId: string, activeOnly?: boolean, ctx?: TransactionContext): Promise<Task[]>;
    getTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<Task | null>;
    addFocusMinutesToTask(userId: string, taskId: string, minutes: number, ctx?: TransactionContext): Promise<boolean>;
}
