import { TransactionContext } from '../transaction/transaction-manager';

export interface Challenge {
    id: string | number;
    creator_id: string;
    guild_id: string | null;
    title: string;
    challenge_type: string;
    target_value: number;
    start_date: string;
    end_date: string;
    status: string;
    created_at: string;
}

export interface ChallengeMember {
    id: string | number;
    challenge_id: string | number;
    user_id: string;
    progress: number;
    joined_at: string;
}

export interface ChallengeRepository {
    createChallenge(creatorId: string, title: string, challengeType: string, targetValue: number, startDate: string, endDate: string, guildId?: string | null, ctx?: TransactionContext): Promise<Challenge>;
    getChallenge(challengeId: string | number, ctx?: TransactionContext): Promise<Challenge | null>;
    joinChallenge(challengeId: string | number, userId: string, ctx?: TransactionContext): Promise<void>;
    updateChallengeProgress(challengeId: string | number, userId: string, progressAmount: number, ctx?: TransactionContext): Promise<void>;
    getChallengeLeaderboard(challengeId: string | number, limit?: number, ctx?: TransactionContext): Promise<{ discord_id: string; progress: number }[]>;
}
