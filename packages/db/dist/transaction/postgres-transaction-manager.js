"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgresTransactionManager = void 0;
class PostgresTransactionManager {
    db;
    constructor(db) {
        this.db = db;
    }
    async execute(callback) {
        return this.db.transaction(async (tx) => {
            const ctx = { db: tx, _tx: 'postgres' };
            return callback(ctx);
        });
    }
}
exports.PostgresTransactionManager = PostgresTransactionManager;
