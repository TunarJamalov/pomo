import { UserRepository, User, UserUpdateParams } from './user-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqliteUserRepository implements UserRepository {
    constructor(private db: any) {}

    async getUser(userId: string, ctx?: TransactionContext): Promise<User | null> {
        return (ctx?.db || this.db).prepare('SELECT * FROM users WHERE id = ?').get(Number(userId)) || null;
    }

    async updateUser(userId: string, updates: UserUpdateParams, ctx?: TransactionContext): Promise<void> {
        const keys = Object.keys(updates);
        if (keys.length === 0) return;
        const sets = keys.map(k => `${k} = ?`).join(', ');
        const values = keys.map(k => (updates as any)[k]);
        values.push(Number(userId));
        (ctx?.db || this.db).prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...values);
    }

    async incrementField(userId: string, field: keyof User, amount: number, ctx?: TransactionContext): Promise<void> {
        (ctx?.db || this.db).prepare(`UPDATE users SET ${field} = ${field} + ? WHERE id = ?`).run(amount, Number(userId));
        
        if (field === 'xp') {
            (ctx?.db || this.db).prepare(`UPDATE users SET season_xp = season_xp + ? WHERE id = ?`).run(amount, Number(userId));
        } else if (field === 'total_focus_minutes') {
            (ctx?.db || this.db).prepare(`UPDATE users SET season_focus_minutes = season_focus_minutes + ? WHERE id = ?`).run(amount, Number(userId));
        }
    }

    async deductWaterAtomic(userId: string, amount: number, ctx?: TransactionContext): Promise<boolean> {
        const result = (ctx?.db || this.db).prepare('UPDATE users SET water = water - ? WHERE id = ? AND water >= ?').run(amount, Number(userId), amount);
        return result.changes > 0;
    }

    async getReferralCount(userId: string, ctx?: TransactionContext): Promise<number> {
        const user = await this.getUser(userId, ctx);
        if (!user || !user.discord_id) return 0;
        // Legacy table uses discord_id for referred_by
        const row = (ctx?.db || this.db).prepare('SELECT COUNT(*) as count FROM users WHERE referred_by = ?').get(user.discord_id);
        return row.count || 0;
    }

    async setReferral(userId: string, referrerUserId: string, ctx?: TransactionContext): Promise<{ success: boolean; reason?: string }> {
        const user = await this.getUser(userId, ctx);
        if (!user) return { success: false, reason: 'user_not_found' };
        if (user.referred_by) {
            return { success: false, reason: 'already_referred' };
        }
        if (userId === referrerUserId) {
            return { success: false, reason: 'self_referral' };
        }
        const referrer = await this.getUser(referrerUserId, ctx);
        if (!referrer) {
            return { success: false, reason: 'invalid_referrer' };
        }
        // Legacy table uses discord_id for referred_by
        (ctx?.db || this.db).prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(referrer.discord_id, Number(userId));
        return { success: true };
    }
}
