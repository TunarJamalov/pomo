import { TransactionContext } from '../transaction/transaction-manager';

export interface QuestRepository {
    claimQuest(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean>;
    markQuestNotified(userId: string, questKey: string, questDate: string, ctx?: TransactionContext): Promise<boolean>;
}
