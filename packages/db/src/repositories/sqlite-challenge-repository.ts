import { Database } from 'better-sqlite3';
import { Challenge, ChallengeRepository } from './challenge-repository';

export class SqliteChallengeRepository implements ChallengeRepository {
    constructor(private db: Database) {}

    async createChallenge(creatorId: string, title: string, challengeType: string, targetValue: number, startDate: string, endDate: string, guildId?: string | null): Promise<Challenge> {
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

        return this.getChallenge(Number(challengeId)) as Promise<Challenge>;
    }

    async getChallenge(challengeId: string | number): Promise<Challenge | null> {
        return this.db.prepare("SELECT * FROM challenges WHERE id = ?").get(challengeId) as Challenge | null;
    }

    async joinChallenge(challengeId: string | number, userId: string): Promise<void> {
        this.db.prepare("INSERT INTO challenge_members (challenge_id, user_id) VALUES (?, ?)").run(challengeId, userId);
    }

    async updateChallengeProgress(challengeId: string | number, userId: string, progressAmount: number): Promise<void> {
        this.db.prepare(`
            UPDATE challenge_members
            SET progress = progress + ?
            WHERE challenge_id = ? AND user_id = ?
        `).run(progressAmount, challengeId, userId);
    }

    async getChallengeLeaderboard(challengeId: string | number, limit: number = 10): Promise<{ discord_id: string; progress: number }[]> {
        const rows = this.db.prepare(`
            SELECT user_id as discord_id, progress
            FROM challenge_members
            WHERE challenge_id = ?
            ORDER BY progress DESC
            LIMIT ?
        `).all(challengeId, limit) as any[];
        
        return rows;
    }
}
