import Database from 'better-sqlite3';
import { SqliteIdentityRepository } from '../repositories/sqlite-identity-repository';
import { SqliteProductivityRepository } from '../repositories/sqlite-productivity-repository';

describe('ProductivityRepository Foundation (SQLite)', () => {
    let db: Database.Database;
    let identityRepo: SqliteIdentityRepository;
    let prodRepo: SqliteProductivityRepository;

    beforeEach(() => {
        db = new Database(':memory:');
        // Production enforces foreign keys, so the test must too
        db.pragma('foreign_keys = ON');
        db.exec(`
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                discord_id TEXT UNIQUE NOT NULL
            );
            CREATE TABLE todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                content TEXT NOT NULL,
                completed INTEGER DEFAULT 0,
                focus_minutes INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now')),
                completed_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(discord_id)
            );
        `);
        identityRepo = new SqliteIdentityRepository(db);
        prodRepo = new SqliteProductivityRepository(db, identityRepo);
    });

    afterEach(() => {
        db.close();
    });

    test('Full CRUD flow for Tasks', async () => {
        const { userId } = await identityRepo.resolveIdentity('discord', 'discord_123');

        // Create Task
        const createRes = await prodRepo.createTask(userId, 'Read a book');
        expect(createRes.success).toBe(true);
        const taskId = createRes.task!.id;
        // Stored under the Discord id, which is how the bot reads todos
        expect(db.prepare('SELECT user_id FROM todos WHERE id = ?').get(Number(taskId))).toEqual({ user_id: 'discord_123' });

        // List active
        const active = await prodRepo.listTasks(userId, true);
        expect(active.length).toBe(1);
        expect(active[0].content).toBe('Read a book');
        expect(active[0].completed).toBe(false);

        // Add focus minutes
        const updated = await prodRepo.addFocusMinutesToTask(userId, taskId, 25);
        expect(updated).toBe(true);

        const taskAfter = await prodRepo.getTask(userId, taskId);
        expect(taskAfter!.focus_minutes).toBe(25);

        // Complete
        const completed = await prodRepo.completeTask(userId, taskId);
        expect(completed).toBe(true);

        // List active again (should be 0)
        const activeNow = await prodRepo.listTasks(userId, true);
        expect(activeNow.length).toBe(0);

        // List all (should be 1)
        const allNow = await prodRepo.listTasks(userId, false);
        expect(allNow.length).toBe(1);
        expect(allNow[0].completed).toBe(true);

        // Delete
        const deleted = await prodRepo.deleteTask(userId, taskId);
        expect(deleted).toBe(true);

        const empty = await prodRepo.listTasks(userId, false);
        expect(empty.length).toBe(0);
    });
});
