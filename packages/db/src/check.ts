import { getClient } from "./client";
import { sql } from "drizzle-orm";

async function main() {
  const db = getClient();
  if (!db) {
    console.error("❌ DATABASE_URL not set, cannot connect to Postgres.");
    process.exit(1);
  }
  try {
    const result = await db.execute(sql`SELECT 1 AS success`);
    if (result && result[0].success === 1) {
      console.log("✅ PostgreSQL connection successful!");
      process.exit(0);
    } else {
      console.error("❌ PostgreSQL connected, but unexpected result.");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err);
    process.exit(1);
  }
}
main();
