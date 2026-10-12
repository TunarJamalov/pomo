import { TransactionContext } from '../transaction/transaction-manager';

export interface InventoryItem {
    id: number;
    user_id: string; // discord_id
    item_key: string;
    quantity: number;
}

export interface InventoryRepository {
    getItem(userId: string, itemKey: string, ctx?: TransactionContext): Promise<InventoryItem | null>;
    addItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<void>;
    removeItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
    listItems(userId: string, ctx?: TransactionContext): Promise<InventoryItem[]>;
}
