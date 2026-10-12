import { config } from "dotenv";
import path from "path";

// Try to load local .env for development inside packages/db
config({ path: path.resolve(__dirname, "../.env") });
// Try to load from root/apps if running from elsewhere
config();

export const env = {
  DATABASE_URL: process.env.DATABASE_URL,
};
