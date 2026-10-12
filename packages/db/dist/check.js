"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("./client");
const drizzle_orm_1 = require("drizzle-orm");
async function main() {
    const db = (0, client_1.getClient)();
    if (!db) {
        console.error("❌ DATABASE_URL not set, cannot connect to Postgres.");
        process.exit(1);
    }
    try {
        const result = await db.execute((0, drizzle_orm_1.sql) `SELECT 1 AS success`);
        if (result && result[0].success === 1) {
            console.log("✅ PostgreSQL connection successful!");
            process.exit(0);
        }
        else {
            console.error("❌ PostgreSQL connected, but unexpected result.");
            process.exit(1);
        }
    }
    catch (err) {
        console.error("❌ PostgreSQL connection failed:", err);
        process.exit(1);
    }
}
main();
