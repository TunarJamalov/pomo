import { Database } from 'better-sqlite3';
import { Clan, ClanMember, ClanRepository } from './clan-repository';
import { IdentityRepository } from './identity-repository';

export class SqliteClanRepository implements ClanRepository {
    constructor(private db: Database, private identityRepository: IdentityRepository) {}

    async getClanByUserId(userId: string): Promise<Clan | null> {
        const member = this.db.prepare("SELECT * FROM clan_members WHERE discord_id = ?").get(userId) as any;
        if (!member) return null;
        return this.getClanById(member.clan_id);
    }

    async getClanById(clanId: string | number): Promise<Clan | null> {
        const clan = this.db.prepare("SELECT * FROM clans WHERE id = ?").get(clanId) as any;
        if (!clan) return null;
        return clan;
    }

    async createClan(ownerId: string, name: string): Promise<Clan> {
        const result = this.db.prepare("INSERT INTO clans (name, owner_id) VALUES (?, ?)").run(name, ownerId);
        const clanId = result.lastInsertRowid;
        this.db.prepare("INSERT INTO clan_members (clan_id, discord_id, role) VALUES (?, ?, 'owner')").run(clanId, ownerId);
        return this.getClanById(Number(clanId)) as Promise<Clan>;
    }

    async joinClan(clanId: string | number, userId: string): Promise<void> {
        this.db.prepare("INSERT INTO clan_members (clan_id, discord_id) VALUES (?, ?)").run(clanId, userId);
    }

    async leaveClan(userId: string): Promise<void> {
        this.db.prepare("DELETE FROM clan_members WHERE discord_id = ?").run(userId);
    }

    async addClanXP(clanId: string | number, minutes: number, xpBoost: number): Promise<void> {
        this.db.prepare(`
            UPDATE clans
            SET total_focus_minutes = total_focus_minutes + ?,
                xp = xp + ?,
                season_xp = season_xp + ?
            WHERE id = ?
        `).run(minutes, xpBoost, xpBoost, clanId);
    }

    async getClanMembers(clanId: string | number): Promise<ClanMember[]> {
        const rows = this.db.prepare("SELECT * FROM clan_members WHERE clan_id = ?").all(clanId) as any[];
        return rows.map(r => ({
            id: r.id || r.discord_id, 
            clan_id: r.clan_id,
            discord_id: r.discord_id, 
            role: r.role,
            joined_at: r.joined_at
        }));
    }

    async getClanLeaderboard(limit: number = 10): Promise<Clan[]> {
        return this.db.prepare("SELECT * FROM clans ORDER BY season_xp DESC LIMIT ?").all(limit) as Clan[];
    }
}
