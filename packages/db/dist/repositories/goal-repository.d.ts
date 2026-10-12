import { TransactionContext } from '../transaction/transaction-manager';
export interface Goal {
    id: string;
    user_id: string;
    type: string;
    target_value: number;
    current_value: number;
    deadline: string | null;
    created_at: string;
}
export interface GoalRepository {
    createGoal(userId: string, type: string, targetValue: number, deadline?: string, ctx?: TransactionContext): Promise<Goal>;
    getGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<Goal | null>;
    listGoals(userId: string, ctx?: TransactionContext): Promise<Goal[]>;
    updateGoalProgress(userId: string, goalId: string, incrementValue: number, ctx?: TransactionContext): Promise<Goal | null>;
    deleteGoal(userId: string, goalId: string, ctx?: TransactionContext): Promise<boolean>;
}
