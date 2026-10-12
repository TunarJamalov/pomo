import { QuestRepository } from './quest-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteQuestRepository implements QuestRepository {
    private db;
    constructor(db: any);
    claimQuest(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean>;
    markQuestNotified(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean>;
}
