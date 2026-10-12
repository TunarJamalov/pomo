/**
 * Opaque transaction context passed to repositories.
 * The internal structure depends on the active driver (SQLite vs Postgres).
 */
export interface TransactionContext {
    _tx?: any;
    db: any;
}
/**
 * Executes operations atomically within a database transaction.
 */
export interface TransactionManager {
    /**
     * Executes the given callback inside a transaction.
     * If the callback throws, the transaction is rolled back.
     *
     * @param callback Async function executing repository operations
     */
    execute<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
