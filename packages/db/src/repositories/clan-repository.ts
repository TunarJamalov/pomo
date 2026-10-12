import { TransactionContext } from '../transaction/transaction-manager';

export interface Clan {
    id: number | string;
    name: string;
    owner_id: string;
    water: number;
    xp: number;
    season_xp: number;
    level: number;
    tree_level: number;
    total_focus_minutes: number;
    created_at: string;
}

export interface ClanMember {
    id: number | string;
    clan_id: number | string;
    discord_id: string;
    role: string;
    joined_at: string;
}

export interface ClanRepository {
    getClanByUserId(userId: string, ctx?: TransactionContext): Promise<Clan | null>;
    getClanById(clanId: string | number, ctx?: TransactionContext): Promise<Clan | null>;
    createClan(ownerId: string, name: string, ctx?: TransactionContext): Promise<Clan>;
    joinClan(clanId: string | number, userId: string, ctx?: TransactionContext): Promise<void>;
    leaveClan(userId: string, ctx?: TransactionContext): Promise<void>;
    addClanXP(clanId: string | number, minutes: number, xpBoost: number, ctx?: TransactionContext): Promise<void>;
    getClanMembers(clanId: string | number, ctx?: TransactionContext): Promise<ClanMember[]>;
    getClanLeaderboard(limit?: number, ctx?: TransactionContext): Promise<Clan[]>;
}
