import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const premium_entitlements = pgTable("premium_entitlements", {
  user_id: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  plan_key: text("plan_key").default("pro_beta").notNull(),
  status: text("status").default("active").notNull(),
  source: text("source").default("manual_beta").notNull(),
  starts_at: timestamp("starts_at", { mode: "string" }).defaultNow().notNull(),
  expires_at: timestamp("expires_at", { mode: "string" }),
  granted_by: text("granted_by"),
  note: text("note"),
  provider_ref: text("provider_ref"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  revoked_at: timestamp("revoked_at", { mode: "string" }),
});

export const premium_events = pgTable("premium_events", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  plan_key: text("plan_key").notNull(),
  source: text("source").notNull(),
  duration_days: integer("duration_days"),
  actor_id: text("actor_id"),
  note: text("note"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});
