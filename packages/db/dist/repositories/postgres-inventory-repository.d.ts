import { InventoryRepository, InventoryItem } from './inventory-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class PostgresInventoryRepository implements InventoryRepository {
    private db;
    constructor(db: any);
    private mapItem;
    getItem(userId: string, itemKey: string, ctx?: TransactionContext): Promise<InventoryItem | null>;
    addItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<void>;
    removeItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
    listItems(userId: string, ctx?: TransactionContext): Promise<InventoryItem[]>;
}
