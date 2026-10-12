import { QuestRepository } from './quest-repository';
import { TransactionContext } from '../transaction/transaction-manager';
import { and, eq } from 'drizzle-orm';
import { quest_claims } from '../schema/misc';
import { quest_notifications } from '../schema/events';

export class PostgresQuestRepository implements QuestRepository {
    constructor(private db: any) {}

    async claimQuest(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;

        // Check if already claimed (ON CONFLICT DO NOTHING equivalent)
        const existing = await dbClient.select({ id: quest_claims.id })
            .from(quest_claims)
            .where(and(
                eq(quest_claims.user_id, userId),
                eq(quest_claims.quest_key, questKey),
                eq(quest_claims.quest_date, questDate)
            ))
            .limit(1);

        if (existing.length > 0) return false;

        await dbClient.insert(quest_claims).values({
            user_id: userId,
            quest_key: questKey,
            quest_date: questDate
        });

        return true;
    }

    async markQuestNotified(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean> {
        const dbClient = ctx?.db || this.db;

        const existing = await dbClient.select({ id: quest_notifications.id })
            .from(quest_notifications)
            .where(and(
                eq(quest_notifications.user_id, userId),
                eq(quest_notifications.quest_key, questKey),
                eq(quest_notifications.quest_date, questDate)
            ))
            .limit(1);

        if (existing.length > 0) return false;

        await dbClient.insert(quest_notifications).values({
            user_id: userId,
            quest_key: questKey,
            quest_date: questDate
        });

        return true;
    }
}
