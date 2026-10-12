import { TransactionContext, TransactionManager } from './transaction-manager';

/**
 * A Promise-based Mutex that guarantees sequential execution 
 * for asynchronous blocks of code.
 */
class SQLiteMutex {
    private promise: Promise<void> = Promise.resolve();

    async lock(): Promise<() => void> {
        let unlockNext!: () => void;
        const willLock = new Promise<void>(resolve => {
            unlockNext = resolve;
        });
        const willUnlock = this.promise.then(() => unlockNext);
        this.promise = this.promise.then(() => willLock);
        return willUnlock;
    }
}

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
export class SqliteTransactionManager implements TransactionManager {
    private mutex = new SQLiteMutex();
    private db: any;

    constructor(db: any) {
        this.db = db;
    }

    async execute<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T> {
        // 1. Lock the SQLite connection for this Node process
        const unlock = await this.mutex.lock();

        // Check if we are already inside a transaction (nested transactions not supported natively yet)
        if (this.db.inTransaction) {
            unlock();
            throw new Error("Nested transactions are not currently supported by SqliteTransactionManager");
        }

        // 2. Start the transaction
        this.db.prepare('BEGIN').run();
        
        try {
            // 3. Provide an empty context token
            // (For SQLite, the repositories use the global DB connection safely since it is locked)
            const ctx: TransactionContext = { db: this.db, _tx: 'sqlite' };
            
            // 4. Execute domain logic
            const result = await callback(ctx);
            
            // 5. Commit if successful
            if (this.db.inTransaction) {
                this.db.prepare('COMMIT').run();
            }
            
            return result;
        } catch (error) {
            // 6. Rollback if an error occurs
            if (this.db.inTransaction) {
                this.db.prepare('ROLLBACK').run();
            }
            throw error;
        } finally {
            // 7. ALWAYS release the lock
            unlock();
        }
    }
}
