import { Database } from 'better-sqlite3';
import { Challenge, ChallengeRepository } from './challenge-repository';
export declare class SqliteChallengeRepository implements ChallengeRepository {
    private db;
    constructor(db: Database);
    createChallenge(creatorId: string, title: string, challengeType: string, targetValue: number, startDate: string, endDate: string, guildId?: string | null): Promise<Challenge>;
    getChallenge(challengeId: string | number): Promise<Challenge | null>;
    joinChallenge(challengeId: string | number, userId: string): Promise<void>;
    updateChallengeProgress(challengeId: string | number, userId: string, progressAmount: number): Promise<void>;
    getChallengeLeaderboard(challengeId: string | number, limit?: number): Promise<{
        discord_id: string;
        progress: number;
    }[]>;
}
