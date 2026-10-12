import { InventoryRepository, InventoryItem } from './inventory-repository';
import { IdentityRepository } from './identity-repository';
import { TransactionContext } from '../transaction/transaction-manager';
export declare class SqliteInventoryRepository implements InventoryRepository {
    private db;
    private identityRepo;
    constructor(db: any, identityRepo: IdentityRepository);
    getItem(userId: string, itemKey: string, ctx?: TransactionContext): Promise<InventoryItem | null>;
    addItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<void>;
    listItems(userId: string, ctx?: TransactionContext): Promise<InventoryItem[]>;
    removeItem(userId: string, itemKey: string, quantity: number, ctx?: TransactionContext): Promise<boolean>;
}
