import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const guild_goals = pgTable("guild_goals", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  guild_id: text("guild_id").notNull(),
  week_start: text("week_start").notNull(),
  target_minutes: integer("target_minutes").notNull(),
  reward_water: integer("reward_water").default(0).notNull(),
  reward_xp: integer("reward_xp").default(0).notNull(),
  min_contribution: integer("min_contribution").default(0).notNull(),
  channel_id: text("channel_id"),
  status: text("status").default("active").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { mode: "string" }),
});

export const guild_goal_contributions = pgTable("guild_goal_contributions", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  goal_id: uuid("goal_id").notNull().references(() => guild_goals.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  minutes: integer("minutes").default(0).notNull(),
  source_type: text("source_type").notNull(),
  source_id: text("source_id").notNull(), // Polymorphic, could be UUID
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const guild_goal_claims = pgTable("guild_goal_claims", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  goal_id: uuid("goal_id").notNull().references(() => guild_goals.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  claimed_at: timestamp("claimed_at", { mode: "string" }).defaultNow().notNull(),
});

export const personal_goal_settings = pgTable("personal_goal_settings", {
  user_id: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").default(false).notNull(),
  period_type: text("period_type").default("weekly").notNull(),
  target_minutes: integer("target_minutes").default(0).notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const personal_goals = pgTable("personal_goals", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period_type: text("period_type").notNull(),
  period_start: text("period_start").notNull(),
  period_end: text("period_end").notNull(),
  target_minutes: integer("target_minutes").notNull(),
  status: text("status").default("active").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { mode: "string" }),
});

export const personal_goal_contributions = pgTable("personal_goal_contributions", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  goal_id: uuid("goal_id").notNull().references(() => personal_goals.id, { onDelete: "cascade" }),
  minutes: integer("minutes").notNull(),
  source_type: text("source_type").notNull(),
  source_id: text("source_id").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const user_exams = pgTable("user_exams", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  exam_date: timestamp("exam_date", { mode: "string" }).notNull(),
  target_hours: integer("target_hours").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

