import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const streak_breaks = pgTable("streak_breaks", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  previous_streak: integer("previous_streak").notNull(),
  gap_days: integer("gap_days").notNull(),
  broken_at: timestamp("broken_at", { mode: "string" }).notNull(),
  expires_at: timestamp("expires_at", { mode: "string" }).notNull(),
  recovered_at: timestamp("recovered_at", { mode: "string" }),
});

export const pro_profile_settings = pgTable("pro_profile_settings", {
  user_id: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  accent_key: text("accent_key"),
  badge_key: text("badge_key"),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const pending_transfers = pgTable("pending_transfers", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  sender_id: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiver_id: uuid("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  log_message_id: text("log_message_id"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const quest_claims = pgTable("quest_claims", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  quest_key: text("quest_key").notNull(),
  quest_date: text("quest_date").notNull(),
  claimed_at: timestamp("claimed_at", { mode: "string" }).defaultNow().notNull(),
});

export const market_prices = pgTable("market_prices", {
  item_key: text("item_key").primaryKey(),
  price: integer("price").notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});
