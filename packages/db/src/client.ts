import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let _db: ReturnType<typeof drizzle> | null = null;
let _initialized = false;

function _ensureClient() {
    if (_initialized) return _db;
    _initialized = true;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        _db = null;
        return null;
    }

    try {
        const conn = postgres(databaseUrl, { max: 10, idle_timeout: 20 });
        _db = drizzle(conn, { schema });
    } catch (e) {
        console.error('[DB] Failed to connect to Postgres:', e);
        _db = null;
    }

    return _db;
}

export function getClient(): ReturnType<typeof drizzle> | null {
    return _ensureClient();
}

export function isPostgresEnabled(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

