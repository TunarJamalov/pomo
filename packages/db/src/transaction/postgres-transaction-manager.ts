import { TransactionContext, TransactionManager } from './transaction-manager';

export class PostgresTransactionManager implements TransactionManager {
    private db: any;

    constructor(db: any) {
        this.db = db;
    }

    async execute<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T> {
        return this.db.transaction(async (tx: any) => {
            const ctx: TransactionContext = { db: tx, _tx: 'postgres' };
            return callback(ctx);
        });
    }
}
