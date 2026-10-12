import { QuestRepository } from './quest-repository';
import { TransactionContext } from '../transaction/transaction-manager';

export class SqliteQuestRepository implements QuestRepository {
    constructor(private db: any) {}

    async claimQuest(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean> {
        const result = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO quest_claims (user_id, quest_key, quest_date)
            VALUES (?, ?, ?)
        `).run(userId, questKey, questDate);
        return result.changes > 0;
    }

    async markQuestNotified(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean> {
        const result = (ctx?.db || this.db).prepare(`
            INSERT OR IGNORE INTO quest_notifications (user_id, quest_key, quest_date)
            VALUES (?, ?, ?)
        `).run(userId, questKey, questDate);
        return result.changes > 0;
    }
}
