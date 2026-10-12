import { UserRepository, User, UserUpdateParams } from './user-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresUserRepository implements UserRepository {
    private db;
    constructor(db: any);
    getUser(userId: string, ctx?: TransactionContext): Promise<User | null>;
    updateUser(userId: string, updates: UserUpdateParams, ctx?: TransactionContext): Promise<void>;
    incrementField(userId: string, field: keyof User, amount: number, ctx?: TransactionContext): Promise<void>;
    deductWaterAtomic(userId: string, amount: number, ctx?: TransactionContext): Promise<boolean>;
    getReferralCount(userId: string, ctx?: TransactionContext): Promise<number>;
    setReferral(userId: string, referrerUserId: string, ctx?: TransactionContext): Promise<{
        success: boolean;
        reason?: string;
    }>;
}
