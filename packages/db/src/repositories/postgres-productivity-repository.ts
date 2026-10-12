import { ProductivityRepository, Task, CreateTaskOptions } from './productivity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, and, sql } from 'drizzle-orm';
import { tasks } from '../schema/productivity';

export class PostgresProductivityRepository implements ProductivityRepository {
    constructor(private db: any) {}

    private mapTask(row: any): Task {
        return {
            id: String(row.id),
            content: row.content,
            completed: Boolean(row.completed),
            focus_minutes: row.focus_minutes || 0,
            subject_id: row.subject_id,
            priority: row.priority,
            deadline: row.deadline,
            created_at: row.created_at,
            completed_at: row.completed_at
        };
    }

    async createTask(userId: string, content: string, options?: CreateTaskOptions, ctx?: TransactionContext): Promise<{ success: boolean; task?: Task; reason?: string }> {
        const dbClient = ctx?.db || this.db;
        const activeCount = await dbClient.select({ count: sql`COUNT(*)` })
            .from(tasks)
            .where(and(eq(tasks.user_id, userId), eq(tasks.completed, false)));
            
        if (Number(activeCount[0]?.count || 0) >= 50) {
            return { success: false, reason: 'limit_reached' };
        }
        
        const result = await dbClient.insert(tasks)
            .values({
                user_id: userId,
                content: content,
                completed: false,
                focus_minutes: 0,
                subject_id: options?.subjectId || null,
                priority: options?.priority || 'medium',
                deadline: options?.deadline || null,
            })
            .returning();
            
        return { success: true, task: this.mapTask(result[0]) };
    }

    async completeTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(tasks)
            .set({ completed: true, completed_at: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)))
            .returning({ id: tasks.id });
            
        return result.length > 0;
    }

    async uncompleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(tasks)
            .set({ completed: false, completed_at: null })
            .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)))
            .returning({ id: tasks.id });
            
        return result.length > 0;
    }

    async deleteTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.delete(tasks)
            .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)))
            .returning({ id: tasks.id });
            
        return result.length > 0;
    }

    async listTasks(userId: string, activeOnly: boolean = false, ctx?: TransactionContext): Promise<Task[]> {
        const dbClient = ctx?.db || this.db;
        let query = dbClient.select().from(tasks).where(eq(tasks.user_id, userId));
        
        if (activeOnly) {
            query = dbClient.select().from(tasks).where(and(eq(tasks.user_id, userId), eq(tasks.completed, false)));
        }
        
        const rows = await query;
        return rows.map((r: any) => this.mapTask(r));
    }

    async getTask(userId: string, taskId: string, ctx?: TransactionContext): Promise<Task | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select()
            .from(tasks)
            .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)))
            .limit(1);
            
        return result.length > 0 ? this.mapTask(result[0]) : null;
    }

    async addFocusMinutesToTask(userId: string, taskId: string, minutes: number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.update(tasks)
            .set({ focus_minutes: sql`${tasks.focus_minutes} + ${minutes}` })
            .where(and(eq(tasks.id, taskId), eq(tasks.user_id, userId)))
            .returning({ id: tasks.id });
            
        return result.length > 0;
    }
}
