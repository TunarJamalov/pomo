import { pgTable, text, integer, boolean, timestamp, real, uuid, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  water: integer("water").default(0).notNull(),
  total_focus_minutes: integer("total_focus_minutes").default(0).notNull(),
  xp: integer("xp").default(0).notNull(),
  level: integer("level").default(1).notNull(),
  streak: integer("streak").default(0).notNull(),
  last_study_date: timestamp("last_study_date", { mode: "string" }),
  last_daily_date: timestamp("last_daily_date", { mode: "string" }),
  premium: integer("premium").default(0).notNull(),
  bio: text("bio").default(""),
  theme: text("theme").default("basic"),
  active_title_key: text("active_title_key"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  season_xp: integer("season_xp").default(0).notNull(),
  season_focus_minutes: integer("season_focus_minutes").default(0).notNull(),
  referred_by: uuid("referred_by"),
  last_premium_daily_date: timestamp("last_premium_daily_date", { mode: "string" }),
  active_buff_type: text("active_buff_type"),
  active_buff_value: real("active_buff_value").default(0),
  buff_expires_at: timestamp("buff_expires_at", { mode: "string" }),
  total_sessions: integer("total_sessions").default(0).notNull(),
  last_loyal_dog_date: timestamp("last_loyal_dog_date", { mode: "string" })
});

export const user_identities = pgTable("user_identities", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  provider_id: text("provider_id").notNull(),
}, (table) => ({
  provider_provider_id_idx: uniqueIndex("idx_user_identities_provider").on(table.provider, table.provider_id)
}));

export const settings = pgTable("settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  notify_before_end: boolean("notify_before_end").default(true).notNull(),
  notify_type: text("notify_type").default("dm").notNull(),
  reminders_enabled: boolean("reminders_enabled").default(true).notNull(),
  notify_friends: boolean("notify_friends").default(false).notNull()
});

export const guest_users = pgTable("guest_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  display_name: text("display_name").default("Guest"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  expires_at: timestamp("expires_at", { mode: "string" }).notNull(),
});
