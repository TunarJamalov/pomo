import { eq, and, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Goal, GoalRepository } from './goal-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { goals } from '../schema/productivity';

export class PostgresGoalRepository implements GoalRepository {
    constructor(private db: NodePgDatabase<any>) {}

    private getDb(ctx?: TransactionContext) {
        return ctx?.db || this.db;
    }

    async createGoal(userId: string, type: string, targetValue: number, deadline?: string, ctx?: TransactionContext): Promise<Goal> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.insert(goals).values({
            user_id: userId,
            type,
            target_value: targetValue,
            current_value: 0,
            deadline: deadline || null,
        }).returning();

        return result as Goal;
    }

    async getGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<Goal | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.select()
            .from(goals)
            .where(and(eq(goals.id, goalId), eq(goals.user_id, userId)));
        return (result as Goal) || null;
    }

    async listGoals(userId: string, ctx?: TransactionContext): Promise<Goal[]> {
        const dbClient = this.getDb(ctx);
        const results = await dbClient.select()
            .from(goals)
            .where(eq(goals.user_id, userId));
        return results as Goal[];
    }

    async updateGoalProgress(userId: string, goalId: string, incrementValue: number, ctx?: TransactionContext): Promise<Goal | null> {
        const dbClient = this.getDb(ctx);
        const [result] = await dbClient.update(goals)
            .set({ current_value: sql`${goals.current_value} + ${incrementValue}` })
            .where(and(eq(goals.id, goalId), eq(goals.user_id, userId)))
            .returning();
        return (result as Goal) || null;
    }

    async deleteGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = this.getDb(ctx);
        const result = await dbClient.delete(goals)
            .where(and(eq(goals.id, goalId), eq(goals.user_id, userId)))
            .returning({ id: goals.id });
        return result.length > 0;
    }
}
