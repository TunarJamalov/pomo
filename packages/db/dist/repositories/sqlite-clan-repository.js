"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteClanRepository = void 0;
class SqliteClanRepository {
    db;
    identityRepository;
    constructor(db, identityRepository) {
        this.db = db;
        this.identityRepository = identityRepository;
    }
    async getClanByUserId(userId) {
        const member = this.db.prepare("SELECT * FROM clan_members WHERE discord_id = ?").get(userId);
        if (!member)
            return null;
        return this.getClanById(member.clan_id);
    }
    async getClanById(clanId) {
        const clan = this.db.prepare("SELECT * FROM clans WHERE id = ?").get(clanId);
        if (!clan)
            return null;
        return clan;
    }
    async createClan(ownerId, name) {
        const result = this.db.prepare("INSERT INTO clans (name, owner_id) VALUES (?, ?)").run(name, ownerId);
        const clanId = result.lastInsertRowid;
        this.db.prepare("INSERT INTO clan_members (clan_id, discord_id, role) VALUES (?, ?, 'owner')").run(clanId, ownerId);
        return this.getClanById(Number(clanId));
    }
    async joinClan(clanId, userId) {
        this.db.prepare("INSERT INTO clan_members (clan_id, discord_id) VALUES (?, ?)").run(clanId, userId);
    }
    async leaveClan(userId) {
        this.db.prepare("DELETE FROM clan_members WHERE discord_id = ?").run(userId);
    }
    async addClanXP(clanId, minutes, xpBoost) {
        this.db.prepare(`
            UPDATE clans
            SET total_focus_minutes = total_focus_minutes + ?,
                xp = xp + ?,
                season_xp = season_xp + ?
            WHERE id = ?
        `).run(minutes, xpBoost, xpBoost, clanId);
    }
    async getClanMembers(clanId) {
        const rows = this.db.prepare("SELECT * FROM clan_members WHERE clan_id = ?").all(clanId);
        return rows.map(r => ({
            id: r.id || r.discord_id,
            clan_id: r.clan_id,
            discord_id: r.discord_id,
            role: r.role,
            joined_at: r.joined_at
        }));
    }
    async getClanLeaderboard(limit = 10) {
        return this.db.prepare("SELECT * FROM clans ORDER BY season_xp DESC LIMIT ?").all(limit);
    }
}
exports.SqliteClanRepository = SqliteClanRepository;
