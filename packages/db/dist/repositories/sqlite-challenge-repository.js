"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqliteChallengeRepository = void 0;
class SqliteChallengeRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async createChallenge(creatorId, title, challengeType, targetValue, startDate, endDate, guildId) {
        const res = this.db.prepare(`
            INSERT INTO challenges (creator_id, guild_id, title, challenge_type, target_value, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(creatorId, guildId || null, title, challengeType, targetValue, startDate, endDate);
        const challengeId = res.lastInsertRowid;
        // Auto-join creator
        this.db.prepare(`
            INSERT INTO challenge_members (challenge_id, user_id)
            VALUES (?, ?)
        `).run(challengeId, creatorId);
        return this.getChallenge(Number(challengeId));
    }
    async getChallenge(challengeId) {
        return this.db.prepare("SELECT * FROM challenges WHERE id = ?").get(challengeId);
    }
    async joinChallenge(challengeId, userId) {
        this.db.prepare("INSERT INTO challenge_members (challenge_id, user_id) VALUES (?, ?)").run(challengeId, userId);
    }
    async updateChallengeProgress(challengeId, userId, progressAmount) {
        this.db.prepare(`
            UPDATE challenge_members
            SET progress = progress + ?
            WHERE challenge_id = ? AND user_id = ?
        `).run(progressAmount, challengeId, userId);
    }
    async getChallengeLeaderboard(challengeId, limit = 10) {
        const rows = this.db.prepare(`
            SELECT user_id as discord_id, progress
            FROM challenge_members
            WHERE challenge_id = ?
            ORDER BY progress DESC
            LIMIT ?
        `).all(challengeId, limit);
        return rows;
    }
}
exports.SqliteChallengeRepository = SqliteChallengeRepository;
