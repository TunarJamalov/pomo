import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const guild_settings = pgTable("guild_settings", {
  guild_id: text("guild_id").primaryKey(), // Discord Snowflake
  report_channel_id: text("report_channel_id"),
  report_enabled: boolean("report_enabled").default(false),
  voice_tracking_enabled: boolean("voice_tracking_enabled").default(false),
  voice_target_id: text("voice_target_id"),
  voice_target_type: text("voice_target_type"),
  voice_rewards_enabled: boolean("voice_rewards_enabled").default(true),
  voice_min_minutes: integer("voice_min_minutes").default(10),
  voice_daily_reward_cap: integer("voice_daily_reward_cap").default(240),
  language: text("language").default("en"),
  timezone: text("timezone").default("UTC"),
  report_last_week_start: text("report_last_week_start"),
  setup_completed_at: timestamp("setup_completed_at", { mode: "string" }),
  studyroom_category_id: text("studyroom_category_id"),
  total_focus_minutes: integer("total_focus_minutes").default(0),
  guild_name: text("guild_name"),
  goal_enabled: boolean("goal_enabled").default(false),
  goal_target_minutes: integer("goal_target_minutes").default(2500),
  goal_channel_id: text("goal_channel_id"),
  goal_min_contribution: integer("goal_min_contribution").default(25),
  studyroom_trigger_id: text("studyroom_trigger_id"),
  global_buddy_matching_enabled: boolean("global_buddy_matching_enabled").default(false),
  study_hub_enabled: boolean("study_hub_enabled").default(false),
  study_hub_accepts_guests: boolean("study_hub_accepts_guests").default(false),
});

export const guild_progress = pgTable("guild_progress", {
  guild_id: text("guild_id").primaryKey(), // References guild_settings informally
  guild_name: text("guild_name"),
  level: integer("level").default(1).notNull(),
  xp: integer("xp").default(0).notNull(),
  total_focus_minutes: integer("total_focus_minutes").default(0).notNull(),
  total_sessions: integer("total_sessions").default(0).notNull(),
  season_xp: integer("season_xp").default(0).notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
});

export const guild_quests = pgTable("guild_quests", {
  id: uuid("id").primaryKey().defaultRandom(), // Was INTEGER
  guild_id: text("guild_id").notNull(),
  week_start: text("week_start").notNull(),
  quest_key: text("quest_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  target: integer("target").notNull(),
  progress: integer("progress").default(0).notNull(),
  reward_water: integer("reward_water").default(0).notNull(),
  reward_xp: integer("reward_xp").default(0).notNull(),
  status: text("status").default("active").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  completed_at: timestamp("completed_at", { mode: "string" }),
});

export const guild_installations = pgTable("guild_installations", {
  guild_id: text("guild_id").primaryKey(),
  guild_name: text("guild_name"),
  member_count: integer("member_count").default(0),
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "set null" }), // Was discord TEXT
  active: boolean("active").default(true),
  is_baseline: boolean("is_baseline").default(true),
  setup_reminder_sent_at: timestamp("setup_reminder_sent_at", { mode: "string" }),
  setup_reminder_attempted_at: timestamp("setup_reminder_attempted_at", { mode: "string" }),
  setup_nudge_sent_at: timestamp("setup_nudge_sent_at", { mode: "string" }),
  joined_at: timestamp("joined_at", { mode: "string" }).defaultNow(),
  left_at: timestamp("left_at", { mode: "string" }),
  last_seen_at: timestamp("last_seen_at", { mode: "string" }).defaultNow(),
});
