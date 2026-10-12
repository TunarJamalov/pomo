import { Clan, ClanMember, ClanRepository } from './clan-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresClanRepository implements ClanRepository {
    private db;
    private identityRepository;
    constructor(db: any, identityRepository: IdentityRepository);
    private getDb;
    getClanByUserId(userId: string, ctx?: TransactionContext): Promise<Clan | null>;
    getClanById(clanId: string | number, ctx?: TransactionContext): Promise<Clan | null>;
    createClan(ownerId: string, name: string, ctx?: TransactionContext): Promise<Clan>;
    joinClan(clanId: string | number, userId: string, ctx?: TransactionContext): Promise<void>;
    leaveClan(userId: string, ctx?: TransactionContext): Promise<void>;
    addClanXP(clanId: string | number, minutes: number, xpBoost: number, ctx?: TransactionContext): Promise<void>;
    getClanMembers(clanId: string | number, ctx?: TransactionContext): Promise<ClanMember[]>;
    getClanLeaderboard(limit?: number, ctx?: TransactionContext): Promise<Clan[]>;
    private mapClan;
}
