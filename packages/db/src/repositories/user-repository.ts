import { TransactionContext } from '../transaction/transaction-manager';

export interface User {
    id: string | number;
    discord_id: string; // Left here for legacy compatibility in objects returned, though mostly unused
    water: number;
    total_focus_minutes: number;
    xp: number;
    level: number;
    streak: number;
    last_study_date: string | null;
    last_daily_date: string | null;
    premium: number;
    bio: string;
    theme: string;
    active_title_key: string | null;
    created_at: string;
    season_xp: number;
    season_focus_minutes: number;
    referred_by: string | null;
    last_premium_daily_date: string | null;
    active_buff_type: string | null;
    active_buff_value: number;
    buff_expires_at: string | null;
    total_sessions: number;
    last_loyal_dog_date: string | null;
}

export type UserUpdateParams = Partial<Omit<User, 'id' | 'discord_id' | 'created_at'>>;

export interface UserRepository {
    getUser(userId: string, ctx?: TransactionContext): Promise<User | null>;
    updateUser(userId: string, updates: UserUpdateParams, ctx?: TransactionContext): Promise<void>;
    incrementField(userId: string, field: keyof User, amount: number, ctx?: TransactionContext): Promise<void>;
    deductWaterAtomic(userId: string, amount: number, ctx?: TransactionContext): Promise<boolean>;
    getReferralCount(userId: string, ctx?: TransactionContext): Promise<number>;
    setReferral(userId: string, referrerUserId: string, ctx?: TransactionContext): Promise<{ success: boolean; reason?: string }>;
}
