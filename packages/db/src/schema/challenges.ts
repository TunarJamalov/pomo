import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const challenges = pgTable("challenges", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  creator_id: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guild_id: text("guild_id"), // Nullable?
  title: text("title").notNull(),
  challenge_type: text("challenge_type").notNull(),
  target_value: integer("target_value").notNull(),
  start_date: timestamp("start_date", { mode: "string" }).notNull(),
  end_date: timestamp("end_date", { mode: "string" }).notNull(),
  status: text("status").default("active").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const challenge_members = pgTable("challenge_members", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  challenge_id: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  progress: integer("progress").default(0).notNull(),
  joined_at: timestamp("joined_at", { mode: "string" }).defaultNow().notNull(),
});
