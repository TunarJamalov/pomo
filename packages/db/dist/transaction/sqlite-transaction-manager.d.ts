import { TransactionContext, TransactionManager } from './transaction-manager';
/**
 * SqliteTransactionManager implements TransactionManager for better-sqlite3.
 *
 * IMPORTANT MUTEX SCOPE LIMITATION:
 * The mutex is completely PROCESS-LOCAL. It only serializes async transactions
 * originating from this specific Node.js process. It provides ZERO protection
 * against other Node instances, worker threads, or external SQLite clients.
 * This is safe ONLY because the current deployment architecture uses a single
 * Node.js instance (the Discord bot process) as the sole writer to the DB.
 */
export declare class SqliteTransactionManager implements TransactionManager {
    private mutex;
    private db;
    constructor(db: any);
    execute<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
