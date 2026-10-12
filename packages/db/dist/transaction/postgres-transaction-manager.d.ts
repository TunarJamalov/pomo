import { TransactionContext, TransactionManager } from './transaction-manager';
export declare class PostgresTransactionManager implements TransactionManager {
    private db;
    constructor(db: any);
    execute<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
