import { UserRepository, User, UserUpdateParams } from './user-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { eq, sql } from 'drizzle-orm';
import { users } from '../schema/users';

export class PostgresUserRepository implements UserRepository {
    constructor(private db: any) {}

    async getUser(userId: string, ctx?: TransactionContext): Promise<User | null> {
        const dbClient = ctx?.db || this.db;
        const result = await dbClient.select().from(users).where(eq(users.id, userId)).limit(1);
        return result.length > 0 ? result[0] : null;
    }

    async updateUser(userId: string, updates: UserUpdateParams, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        const keys = Object.keys(updates);
        if (keys.length === 0) return;
        await dbClient.update(users).set(updates).where(eq(users.id, userId));
    }

    async incrementField(userId: string, field: keyof User, amount: number, ctx?: TransactionContext): Promise<void> {
        const dbClient = ctx?.db || this.db;
        
        let updates: any = {};
        updates[field] = sql`${users[field as keyof typeof users]} + ${amount}`;
        
        if (field === 'xp') {
            updates.season_xp = sql`${users.season_xp} + ${amount}`;
        } else if (field === 'total_focus_minutes') {
            updates.season_focus_minutes = sql`${users.season_focus_minutes} + ${amount}`;
        }

        await dbClient.update(users).set(updates).where(eq(users.id, userId));
    }

    async deductWaterAtomic(userId: string, amount: number, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;
        
        const result = await dbClient.update(users)
            .set({ water: sql`${users.water} - ${amount}` })
            .where(sql`${users.id} = ${userId} AND ${users.water} >= ${amount}`)
            .returning({ id: users.id });
            
        return result.length > 0;
    }

    async getReferralCount(userId: string, ctx?: TransactionContext): Promise<number> {
        const dbClient = ctx?.db || this.db;
        
        // In PostgreSQL schema, referred_by is a UUID
        const result = await dbClient.select({ count: sql`COUNT(*)` })
            .from(users)
            .where(eq(users.referred_by, userId));
            
        return Number(result[0]?.count || 0);
    }

    async setReferral(userId: string, referrerUserId: string, ctx?: TransactionContext): Promise<{ success: boolean; reason?: string }> {
        const dbClient = ctx?.db || this.db;
        
        if (userId === referrerUserId) {
            return { success: false, reason: 'self_referral' };
        }
        
        const user = await this.getUser(userId, ctx);
        if (!user) return { success: false, reason: 'user_not_found' };
        if (user.referred_by) return { success: false, reason: 'already_referred' };
        
        const referrer = await this.getUser(referrerUserId, ctx);
        if (!referrer) return { success: false, reason: 'invalid_referrer' };
        
        await dbClient.update(users)
            .set({ referred_by: referrerUserId })
            .where(eq(users.id, userId));
            
        return { success: true };
    }
}
