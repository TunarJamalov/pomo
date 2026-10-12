import { pgTable, text, integer, boolean, timestamp, uuid, index, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const buddy_requests = pgTable("buddy_requests", {
  id: uuid("id").primaryKey().defaultRandom(), // Notice: Was INTEGER PK, changed to UUID
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guild_id: text("guild_id").notNull(),
  subject: text("subject"),
  duration: integer("duration"),
  mode: text("mode").default("silent"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  status: text("status").default("waiting").notNull(),
  matched_user_id: uuid("matched_user_id").references(() => users.id, { onDelete: "set null" }), // Was TEXT
  match_score: integer("match_score").default(0),
  session_channel_id: text("session_channel_id"),
  ended_at: timestamp("ended_at", { mode: "string" }),
  destination: text("destination").default("pending"),
}, (table) => ({
  buddy_requests_status_idx: index("idx_buddy_requests_status").on(table.status)
}));

export const buddy_swipes = pgTable("buddy_swipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  swiper_id: uuid("swiper_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  target_user_id: uuid("target_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  target_request_id: uuid("target_request_id").notNull().references(() => buddy_requests.id, { onDelete: "cascade" }), // Was INTEGER
  action: text("action").default("like").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
  swiper_target_req_idx: uniqueIndex("idx_buddy_swipes_unique").on(table.swiper_id, table.target_request_id)
}));

export const buddy_blocks = pgTable("buddy_blocks", {
  blocker_id: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blocked_id: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
  blocker_blocked_idx: uniqueIndex("idx_buddy_blocks_unique").on(table.blocker_id, table.blocked_id)
}));

export const buddy_unmatches = pgTable("buddy_unmatches", {
  unmatcher_id: uuid("unmatcher_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  unmatched_id: uuid("unmatched_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
  unmatcher_unmatched_idx: uniqueIndex("idx_buddy_unmatches_unique").on(table.unmatcher_id, table.unmatched_id)
}));

export const buddy_reports = pgTable("buddy_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  reporter_user_id: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }), // Reporter deletion = report deletion
  reported_user_id: uuid("reported_user_id").references(() => users.id, { onDelete: "set null" }), // If reported user is deleted, keep the report
  request_id: uuid("request_id"),
  reason: text("reason").notNull(),
  description: text("description"),
  status: text("status").default("open").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});

export const buddy_hub_consents = pgTable("buddy_hub_consents", {
  id: uuid("id").primaryKey().defaultRandom(),
  match_key: text("match_key").notNull(),
  request_id: uuid("request_id").notNull().references(() => buddy_requests.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  decision: text("decision").default("pending").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow(),
}, (table) => ({
  match_user_idx: uniqueIndex("idx_buddy_hub_consents_unique").on(table.match_key, table.user_id)
}));

export const buddy_hub_invites = pgTable("buddy_hub_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  match_key: text("match_key").notNull().unique(),
  hub_guild_id: text("hub_guild_id").notNull(),
  invite_url: text("invite_url"),
  invite_code: text("invite_code"),
  status: text("status").default("pending").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  sent_at: timestamp("sent_at", { mode: "string" }),
});

export const buddy_analytics_events = pgTable("buddy_analytics_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  event_name: text("event_name").notNull(),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  guild_id: text("guild_id"),
  request_id: uuid("request_id"),
  match_key: text("match_key"),
  scope: text("scope"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});
