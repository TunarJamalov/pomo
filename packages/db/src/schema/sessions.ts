import { pgTable, text, integer, boolean, timestamp, uuid, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type").notNull(), // 'solo', 'team'
  guild_id: text("guild_id"), // Discord Snowflake
  channel_id: text("channel_id"),
  message_id: text("message_id"),
  duration: integer("duration").notNull(),
  title: text("title").default("Study Session"),
  started_at: timestamp("started_at", { mode: "string" }).defaultNow().notNull(),
  ends_at: timestamp("ends_at", { mode: "string" }),
  status: text("status").default("active").notNull(), // completed, active, paused
  reminder_sent: integer("reminder_sent").default(0),
  paused: boolean("paused").default(false),
  paused_at: timestamp("paused_at", { mode: "string" }),
  paused_total_seconds: integer("paused_total_seconds").default(0),
  pause_count: integer("pause_count").default(0),
  subject: text("subject").default("general"),
  pomodoro_data: jsonb("pomodoro_data"),
  outcome: text("outcome"),
  buddy_match_key: text("buddy_match_key"),
  shared_url_token: text("shared_url_token").unique(),
  is_public: boolean("is_public").default(false),
});

export const session_participants = pgTable("session_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "set null" }), // Not needed here really, but kept for legacy
  session_id: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  guest_id: uuid("guest_id"), // Reference to guest_users.id if not registered
  role: text("role").default("member").notNull(), // 'host', 'member'
  joined_at: timestamp("joined_at", { mode: "string" }).defaultNow().notNull()
}, (table) => ({
  session_participants_user_idx: index("idx_session_participants_user").on(table.user_id)
}));

export const voice_sessions = pgTable("voice_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  owner_id: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guild_id: text("guild_id").notNull(),
  channel_id: text("channel_id").notNull(),
  started_at: timestamp("started_at", { mode: "string" }).defaultNow().notNull(),
  last_seen_at: timestamp("last_seen_at", { mode: "string" }).defaultNow(),
  ended_at: timestamp("ended_at", { mode: "string" }),
  total_minutes: integer("total_minutes").default(0),
  credited_minutes: integer("credited_minutes").default(0),
  rewarded_minutes: integer("rewarded_minutes").default(0),
  water_reward: integer("water_reward").default(0),
  xp_reward: integer("xp_reward").default(0),
  status: text("status").default("active").notNull(),
  end_reason: text("end_reason")
});
