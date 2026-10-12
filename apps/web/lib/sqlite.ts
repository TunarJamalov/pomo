import Database from 'better-sqlite3';
import type { Database as BetterSqliteDatabase } from 'better-sqlite3';
import path from 'path';

/**
 * Single shared connection to the bot's SQLite database.
 *
 * - One connection per server process (kept on globalThis so dev HMR does not
 *   leak a new handle on every reload).
 * - `fileMustExist: true`: never create an empty database at a wrong path.
 * - WAL + busy_timeout so web reads/writes co-exist with the Discord bot.
 *
 * Callers must NOT call `.close()` on the returned handle.
 * Do not hold a transaction open across `await` on this connection; use the
 * synchronous `db.transaction(() => { ... })()` API instead, otherwise
 * statements from other concurrent requests could land inside it.
 */
export function getSqliteDbPath() {
  return process.env.POMODORO_DB_PATH || path.resolve(process.cwd(), '../bot/data/pomodoro.db');
}

type SqliteGlobal = typeof globalThis & {
  __pomoSqlite?: { db: BetterSqliteDatabase; path: string };
  __pomoSqliteEnsured?: Set<string>;
};

const g = globalThis as SqliteGlobal;

export function getSqlite(): BetterSqliteDatabase {
  const dbPath = getSqliteDbPath();
  const existing = g.__pomoSqlite;
  if (existing && existing.path === dbPath && existing.db.open) {
    return existing.db;
  }

  const db = new Database(dbPath, { fileMustExist: true });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  g.__pomoSqlite = { db, path: dbPath };
  return db;
}

/**
 * Run additive, idempotent DDL (CREATE TABLE/INDEX IF NOT EXISTS) at most once
 * per process for the given key.
 */
export function ensureSqliteSchema(key: string, ddl: string) {
  const db = getSqlite();
  if (!g.__pomoSqliteEnsured) g.__pomoSqliteEnsured = new Set();
  if (g.__pomoSqliteEnsured.has(key)) return db;
  db.exec(ddl);
  g.__pomoSqliteEnsured.add(key);
  return db;
}
