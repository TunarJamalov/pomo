import { Database } from 'better-sqlite3';
import { Clan, ClanMember, ClanRepository } from './clan-repository';
import { IdentityRepository } from './identity-repository';
export declare class SqliteClanRepository implements ClanRepository {
    private db;
    private identityRepository;
    constructor(db: Database, identityRepository: IdentityRepository);
    getClanByUserId(userId: string): Promise<Clan | null>;
    getClanById(clanId: string | number): Promise<Clan | null>;
    createClan(ownerId: string, name: string): Promise<Clan>;
    joinClan(clanId: string | number, userId: string): Promise<void>;
    leaveClan(userId: string): Promise<void>;
    addClanXP(clanId: string | number, minutes: number, xpBoost: number): Promise<void>;
    getClanMembers(clanId: string | number): Promise<ClanMember[]>;
    getClanLeaderboard(limit?: number): Promise<Clan[]>;
}
