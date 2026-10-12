import { drizzle } from "drizzle-orm/postgres-js";
export declare function getClient(): ReturnType<typeof drizzle> | null;
export declare function isPostgresEnabled(): boolean;
