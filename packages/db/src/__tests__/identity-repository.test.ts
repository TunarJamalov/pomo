import Database from 'better-sqlite3';
import { SqliteIdentityRepository } from '../repositories/sqlite-identity-repository';
import { SqliteUserRepository } from '../repositories/sqlite-user-repository';

describe('IdentityRepository Foundation (SQLite)', () => {
    let db: Database.Database;
    let identityRepo: SqliteIdentityRepository;
    let userRepo: SqliteUserRepository;

    beforeEach(() => {
        db = new Database(':memory:');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_id TEXT UNIQUE NOT NULL,
                water INTEGER DEFAULT 0,
                total_focus_minutes INTEGER DEFAULT 0,
                xp INTEGER DEFAULT 0,
                level INTEGER DEFAULT 1,
                streak INTEGER DEFAULT 0,
                last_study_date TEXT,
                last_daily_date TEXT,
                premium INTEGER DEFAULT 0,
                bio TEXT DEFAULT '',
                theme TEXT DEFAULT 'basic',
                active_title_key TEXT DEFAULT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                season_xp INTEGER DEFAULT 0, 
                season_focus_minutes INTEGER DEFAULT 0, 
                referred_by TEXT DEFAULT NULL, 
                last_premium_daily_date TEXT DEFAULT NULL, 
                active_buff_type TEXT DEFAULT NULL, 
                active_buff_value REAL DEFAULT 0, 
                buff_expires_at TEXT DEFAULT NULL, 
                total_sessions INTEGER DEFAULT 0, 
                last_loyal_dog_date TEXT DEFAULT NULL
            );
        `);
        identityRepo = new SqliteIdentityRepository(db);
        userRepo = new SqliteUserRepository(db);
    });

    afterEach(() => {
        db.close();
    });

    test('New Discord identity creates exactly one identity and resolves correctly', async () => {
        const { userId, isNew } = await identityRepo.resolveIdentity('discord', 'snowflake1');
        expect(isNew).toBe(true);
        expect(typeof userId).toBe('string');
        expect(userId).not.toBe('snowflake1'); // Internal ID != Provider ID
        
        // Ensure only one row exists
        const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
        expect(count.cnt).toBe(1);
    });

    test('Repeated resolution does not create duplicates and returns same canonical userId', async () => {
        const { userId: id1, isNew: new1 } = await identityRepo.resolveIdentity('discord', 'snowflake2');
        const { userId: id2, isNew: new2 } = await identityRepo.resolveIdentity('discord', 'snowflake2');
        
        expect(new1).toBe(true);
        expect(new2).toBe(false);
        expect(id1).toBe(id2);
        
        const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
        expect(count.cnt).toBe(1);
    });

    test('Two concurrent resolutions do not create duplicate identities', async () => {
        // Because SQLite in Node is mostly synchronous under the hood with better-sqlite3, 
        // true concurrency is tricky to mock without async delays. We'll simulate by calling them rapidly.
        // Wait, actually better-sqlite3 is fully synchronous. The Promise wrapper just defers to the microtask queue.
        // Still, let's verify we don't throw unexpected errors on concurrent calls.
        const p1 = identityRepo.resolveIdentity('discord', 'snowflake3');
        const p2 = identityRepo.resolveIdentity('discord', 'snowflake3');
        const p3 = identityRepo.resolveIdentity('discord', 'snowflake3');
        
        const results = await Promise.all([p1, p2, p3]);
        
        const ids = results.map(r => r.userId);
        expect(new Set(ids).size).toBe(1);
        
        const count = db.prepare('SELECT COUNT(*) as cnt FROM users').get() as { cnt: number };
        expect(count.cnt).toBe(1);
    });

    test('Existing Discord user resolves correctly', async () => {
        // Pre-insert legacy user
        db.prepare('INSERT INTO users (discord_id, xp) VALUES (?, ?)').run('legacy1', 999);
        
        const { userId, isNew } = await identityRepo.resolveIdentity('discord', 'legacy1');
        expect(isNew).toBe(false);
        
        const user = await userRepo.getUser(userId);
        expect(user).not.toBeNull();
        expect(user!.xp).toBe(999);
    });

    test('Unknown provider ID does not accidentally resolve another user', async () => {
        await identityRepo.resolveIdentity('discord', 'userA');
        
        const lookup = await identityRepo.lookupIdentity('discord', 'userB');
        expect(lookup).toBeNull();
    });

    test('linkIdentity rejects duplicate provider/providerId', async () => {
        const { userId: idA } = await identityRepo.resolveIdentity('discord', 'userA');
        const { userId: idB } = await identityRepo.resolveIdentity('discord', 'userB');
        
        // Attempt to link userA's discord ID to userB
        await expect(
            identityRepo.linkIdentity(idB, 'discord', 'userA')
        ).rejects.toThrow('Provider identity userA is already linked to another user');
    });

    test('linkIdentity succeeds if linking to self', async () => {
        const { userId } = await identityRepo.resolveIdentity('discord', 'userC');
        await expect(
            identityRepo.linkIdentity(userId, 'discord', 'userC')
        ).resolves.not.toThrow();
    });

    test('getIdentity successfully maps internal ID to provider ID', async () => {
        const { userId } = await identityRepo.resolveIdentity('discord', 'userD');
        const providerId = await identityRepo.getIdentity(userId, 'discord');
        expect(providerId).toBe('userD');
    });

    test('Existing legacy user data remains unchanged when migrating to canonical ID layer', async () => {
        db.prepare('INSERT INTO users (discord_id, water, streak) VALUES (?, ?, ?)').run('legacy2', 150, 5);
        
        const { userId } = await identityRepo.resolveIdentity('discord', 'legacy2');
        const user = await userRepo.getUser(userId);
        
        expect(user!.water).toBe(150);
        expect(user!.streak).toBe(5);
        expect(user!.discord_id).toBe('legacy2');
    });
});
