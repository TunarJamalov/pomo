import { test, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { SqliteUserRepository } from './sqlite-user-repository';
import fs from 'fs';

let db: any;
let repo: SqliteUserRepository;
const DB_PATH = './test_repo.db';

beforeAll(() => {
    db = new Database(DB_PATH);
    db.exec(`
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            water INTEGER DEFAULT 0,
            total_focus_minutes INTEGER DEFAULT 0,
            xp INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            streak INTEGER DEFAULT 0,
            referred_by TEXT DEFAULT NULL
        );
    `);
    repo = new SqliteUserRepository(db);
});

afterAll(() => {
    db.close();
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

test('missing user behavior', async () => {
    const user = await repo.getUserByDiscordId('missing');
    expect(user).toBeNull();
});

test('create user (getOrCreateUser)', async () => {
    const user = await repo.getOrCreateUser('user1');
    expect(user.discord_id).toBe('user1');
    expect(user.water).toBe(0);
});

test('get user by Discord ID', async () => {
    const user = await repo.getUserByDiscordId('user1');
    expect(user).not.toBeNull();
    expect(user?.discord_id).toBe('user1');
});

test('update user', async () => {
    await repo.updateUser('user1', { water: 50, xp: 100 });
    const user = await repo.getUserByDiscordId('user1');
    expect(user?.water).toBe(50);
    expect(user?.xp).toBe(100);
});
