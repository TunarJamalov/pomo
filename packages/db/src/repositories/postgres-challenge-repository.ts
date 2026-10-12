import { eq, and, sql, desc } from 'drizzle-orm';
import * as schema from '../schema';
import { Challenge, ChallengeRepository } from './challenge-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class PostgresChallengeRepository implements ChallengeRepository {
    constructor(private db: any, private identityRepository: IdentityRepository) {}

    private getDb(ctx?: TransactionContext) {
        return (ctx as any)?.transaction || this.db;
    }

    async createChallenge(creatorId: string, title: string, challengeType: string, targetValue: number, startDate: string, endDate: string, guildId?: string | null, ctx?: TransactionContext): Promise<Challenge> {
        const canonicalCreatorId = await this.identityRepository.lookupIdentity('discord', creatorId, ctx);
        if (!canonicalCreatorId) throw new Error('User not found');

        const [challenge] = await this.getDb(ctx)
            .insert(schema.challenges)
            .values({
                creator_id: canonicalCreatorId,
                guild_id: guildId || null,
                title,
                challenge_type: challengeType,
                target_value: targetValue,
                start_date: new Date(startDate),
                end_date: new Date(endDate),
                status: 'active'
            })
            .returning();
            
        await this.joinChallenge(challenge.id, creatorId, ctx);

        return this.mapChallenge(challenge);
    }

    async getChallenge(challengeId: string | number, ctx?: TransactionContext): Promise<Challenge | null> {
        const rows = await this.getDb(ctx)
            .select()
            .from(schema.challenges)
            .where(eq(schema.challenges.id, String(challengeId)))
            .limit(1);

        if (!rows.length) return null;
        return this.mapChallenge(rows[0]);
    }

    async joinChallenge(challengeId: string | number, userId: string, ctx?: TransactionContext): Promise<void> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) throw new Error('User not found');

        await this.getDb(ctx)
            .insert(schema.challenge_members)
            .values({
                challenge_id: String(challengeId),
                user_id: canonicalUserId,
                progress: 0
            });
    }

    async updateChallengeProgress(challengeId: string | number, userId: string, progressAmount: number, ctx?: TransactionContext): Promise<void> {
        const canonicalUserId = await this.identityRepository.lookupIdentity('discord', userId, ctx);
        if (!canonicalUserId) return;

        await this.getDb(ctx)
            .update(schema.challenge_members)
            .set({ progress: sql`progress + ${progressAmount}` })
            .where(
                and(
                    eq(schema.challenge_members.challenge_id, String(challengeId)),
                    eq(schema.challenge_members.user_id, canonicalUserId)
                )
            );
    }

    async getChallengeLeaderboard(challengeId: string | number, limit: number = 10, ctx?: TransactionContext): Promise<{ discord_id: string; progress: number }[]> {
        const rows = await this.getDb(ctx)
            .select()
            .from(schema.challenge_members)
            .where(eq(schema.challenge_members.challenge_id, String(challengeId)))
            .orderBy(desc(schema.challenge_members.progress))
            .limit(limit);

        const results = [];
        for (const row of rows) {
            const discordId = await this.identityRepository.getIdentity(row.user_id, 'discord', ctx);
            if (discordId) {
                results.push({
                    discord_id: discordId,
                    progress: row.progress || 0
                });
            }
        }
        return results;
    }

    private mapChallenge(row: any): Challenge {
        return {
            id: row.id,
            creator_id: row.creator_id,
            guild_id: row.guild_id,
            title: row.title,
            challenge_type: row.challenge_type,
            target_value: row.target_value,
            start_date: row.start_date instanceof Date ? row.start_date.toISOString() : (row.start_date || ''),
            end_date: row.end_date instanceof Date ? row.end_date.toISOString() : (row.end_date || ''),
            status: row.status,
            created_at: row.created_at instanceof Date ? row.created_at.toISOString() : (row.created_at || '')
        };
    }
}
