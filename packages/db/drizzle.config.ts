import { defineConfig } from "drizzle-kit";
import { env } from "./src/config";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is missing.");
}

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
});
