import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Goal, GoalRepository } from './goal-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresGoalRepository implements GoalRepository {
    private db;
    constructor(db: NodePgDatabase<any>);
    private getDb;
    createGoal(userId: string, type: string, targetValue: number, deadline?: string, ctx?: TransactionContext): Promise<Goal>;
    getGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<Goal | null>;
    listGoals(userId: string, ctx?: TransactionContext): Promise<Goal[]>;
    updateGoalProgress(userId: string, goalId: string, incrementValue: number, ctx?: TransactionContext): Promise<Goal | null>;
    deleteGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<boolean>;
}
