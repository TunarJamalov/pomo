import { Challenge, ChallengeRepository } from './challenge-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresChallengeRepository implements ChallengeRepository {
    private db;
    private identityRepository;
    constructor(db: any, identityRepository: IdentityRepository);
    private getDb;
    createChallenge(creatorId: string, title: string, challengeType: string, targetValue: number, startDate: string, endDate: string, guildId?: string | null, ctx?: TransactionContext): Promise<Challenge>;
    getChallenge(challengeId: string | number, ctx?: TransactionContext): Promise<Challenge | null>;
    joinChallenge(challengeId: string | number, userId: string, ctx?: TransactionContext): Promise<void>;
    updateChallengeProgress(challengeId: string | number, userId: string, progressAmount: number, ctx?: TransactionContext): Promise<void>;
    getChallengeLeaderboard(challengeId: string | number, limit?: number, ctx?: TransactionContext): Promise<{
        discord_id: string;
        progress: number;
    }[]>;
    private mapChallenge;
}
