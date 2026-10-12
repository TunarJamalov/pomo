import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteTransactionManager } from './sqlite-transaction-manager';
import { SqliteUserRepository } from '../repositories/sqlite-user-repository';
import { SqliteInventoryRepository } from '../repositories/sqlite-inventory-repository';

describe('Transaction Integration (Users + Inventory)', () => {
    let db: any;
    let tm: SqliteTransactionManager;
    let userRepo: SqliteUserRepository;
    let invRepo: SqliteInventoryRepository;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY, discord_id TEXT, water INTEGER DEFAULT 0,
                total_focus_minutes INTEGER DEFAULT 0, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 0,
                streak INTEGER DEFAULT 0, last_study_date TEXT, last_daily_date TEXT, premium INTEGER DEFAULT 0,
                bio TEXT, theme TEXT, active_title_key TEXT, created_at TEXT, season_xp INTEGER DEFAULT 0,
                season_focus_minutes INTEGER DEFAULT 0, referred_by TEXT, last_premium_daily_date TEXT,
                active_buff_type TEXT, active_buff_value INTEGER DEFAULT 0, buff_expires_at TEXT,
                total_sessions INTEGER DEFAULT 0, last_loyal_dog_date TEXT
            );
            CREATE TABLE inventory (id INTEGER PRIMARY KEY, user_id TEXT, item_key TEXT, quantity INTEGER);
            INSERT INTO users (id, discord_id, water) VALUES (1, 'user123', 100);
            INSERT INTO inventory (user_id, item_key, quantity) VALUES ('user123', 'apple', 5);
        `);
        tm = new SqliteTransactionManager(db);
        userRepo = new SqliteUserRepository(db);
        invRepo = new SqliteInventoryRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    it('should successfully execute a cross-domain transaction', async () => {
        await tm.execute(async (ctx) => {
            // Update User field
            await userRepo.incrementField('user123', 'water', 50, ctx);
            // Update Inventory field
            await invRepo.addItem('user123', 'apple', 2, ctx);
        });

        // Verify actual SQLite state
        const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get('user123');
        const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get('user123', 'apple');

        expect(user.water).toBe(150); // 100 + 50
        expect(inv.quantity).toBe(7); // 5 + 2
    });

    it('should rollback all domains if an error occurs in the transaction', async () => {
        try {
            await tm.execute(async (ctx) => {
                await userRepo.incrementField('user123', 'water', 50, ctx);
                await invRepo.addItem('user123', 'apple', 2, ctx);
                
                // Intentionally throw
                throw new Error('Something went wrong!');
            });
        } catch (e) {
            expect((e as Error).message).toBe('Something went wrong!');
        }

        // Verify actual SQLite state remains unchanged
        const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get('user123');
        const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get('user123', 'apple');

        expect(user.water).toBe(100); // Unchanged
        expect(inv.quantity).toBe(5); // Unchanged
    });

    it('should work normally outside of a transaction context', async () => {
        await userRepo.incrementField('user123', 'water', 10);
        await invRepo.addItem('user123', 'pear', 1);

        const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get('user123');
        const inv = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get('user123', 'pear');

        expect(user.water).toBe(110);
        expect(inv.quantity).toBe(1);
    });

    it('should handle concurrent transactions gracefully using the mutex', async () => {
        const tx1 = tm.execute(async (ctx) => {
            await userRepo.incrementField('user123', 'water', 10, ctx);
            await invRepo.addItem('user123', 'apple', 1, ctx);
        });

        const tx2 = tm.execute(async (ctx) => {
            await userRepo.incrementField('user123', 'water', 20, ctx);
            throw new Error('Abort TX2');
        });

        const tx3 = tm.execute(async (ctx) => {
            await userRepo.incrementField('user123', 'water', 30, ctx);
            await invRepo.addItem('user123', 'banana', 2, ctx);
        });

        await Promise.allSettled([tx1, tx2, tx3]);

        const user = db.prepare('SELECT water FROM users WHERE discord_id = ?').get('user123');
        const apple = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get('user123', 'apple');
        const banana = db.prepare('SELECT quantity FROM inventory WHERE user_id = ? AND item_key = ?').get('user123', 'banana');

        expect(user.water).toBe(140); // 100 + 10 + 30 (tx2 aborted)
        expect(apple.quantity).toBe(6); // 5 + 1
        expect(banana.quantity).toBe(2);
        expect(db.inTransaction).toBe(false);
    });
});
