import { pgTable, text, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { guild_quests } from "./guilds";

export const global_events = pgTable("global_events", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  event_key: text("event_key").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  target_minutes: integer("target_minutes").notNull(),
  progress_minutes: integer("progress_minutes").default(0).notNull(),
  status: text("status").default("active").notNull(),
  started_at: timestamp("started_at", { mode: "string" }).notNull(),
  completed_at: timestamp("completed_at", { mode: "string" }),
});

export const global_event_clues = pgTable("global_event_clues", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  event_id: uuid("event_id").notNull().references(() => global_events.id, { onDelete: "cascade" }),
  clue_key: text("clue_key").notNull(),
  threshold_minutes: integer("threshold_minutes").notNull(),
  clue_text: text("clue_text").notNull(),
});

export const global_event_contributions = pgTable("global_event_contributions", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  event_id: uuid("event_id").notNull().references(() => global_events.id, { onDelete: "cascade" }),
  guild_id: text("guild_id"), // Optional
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source_type: text("source_type").notNull(),
  source_id: text("source_id").notNull(),
  minutes: integer("minutes").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const activity_commands = pgTable("activity_commands", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel_id: text("channel_id").notNull(),
  minutes: integer("minutes").notNull(),
  status: text("status").default("pending").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  type: text("type").default("study").notNull(),
  extra_data: text("extra_data"),
});

export const activity_chat = pgTable("activity_chat", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  username: text("username").notNull(),
  avatar: text("avatar"),
  level: integer("level").notNull(),
  message: text("message").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const guild_xp_events = pgTable("guild_xp_events", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  guild_id: text("guild_id").notNull(),
  source_type: text("source_type").notNull(),
  source_id: text("source_id").notNull(),
  minutes: integer("minutes").notNull(),
  xp: integer("xp").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const guild_quest_contributions = pgTable("guild_quest_contributions", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  quest_id: uuid("quest_id").notNull().references(() => guild_quests.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source_type: text("source_type").notNull(),
  source_id: text("source_id").notNull(),
  minutes: integer("minutes").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const guild_quest_claims = pgTable("guild_quest_claims", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  quest_id: uuid("quest_id").notNull().references(() => guild_quests.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  claimed_at: timestamp("claimed_at", { mode: "string" }).defaultNow().notNull(),
});

export const command_usage = pgTable("command_usage", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  guild_id: text("guild_id"), // Nullable?
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  command_name: text("command_name").notNull(),
  subcommand_name: text("subcommand_name"),
  used_at: timestamp("used_at", { mode: "string" }).defaultNow().notNull(),
});

export const onboarding_events = pgTable("onboarding_events", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  guild_id: text("guild_id"), // Nullable
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  event_type: text("event_type").notNull(),
  topic: text("topic"), // nullable: source SQLite data contains null topic values
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const user_onboarding = pgTable("user_onboarding", {
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tip_key: text("tip_key").notNull(),
  shown_at: timestamp("shown_at", { mode: "string" }).defaultNow().notNull(),
});

export const runtime_state = pgTable("runtime_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const quest_notifications = pgTable("quest_notifications", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  quest_key: text("quest_key").notNull(),
  quest_date: text("quest_date").notNull(),
  notified_at: timestamp("notified_at", { mode: "string" }).defaultNow().notNull(),
});
