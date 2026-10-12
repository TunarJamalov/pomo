"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voice_sessions = exports.session_participants = exports.sessions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.sessions = (0, pg_core_1.pgTable)("sessions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    owner_id: (0, pg_core_1.uuid)("owner_id").references(() => users_1.users.id, { onDelete: "set null" }),
    type: (0, pg_core_1.text)("type").notNull(), // 'solo', 'team'
    guild_id: (0, pg_core_1.text)("guild_id"), // Discord Snowflake
    channel_id: (0, pg_core_1.text)("channel_id"),
    message_id: (0, pg_core_1.text)("message_id"),
    duration: (0, pg_core_1.integer)("duration").notNull(),
    title: (0, pg_core_1.text)("title").default("Study Session"),
    started_at: (0, pg_core_1.timestamp)("started_at", { mode: "string" }).defaultNow().notNull(),
    ends_at: (0, pg_core_1.timestamp)("ends_at", { mode: "string" }),
    status: (0, pg_core_1.text)("status").default("active").notNull(), // completed, active, paused
    reminder_sent: (0, pg_core_1.integer)("reminder_sent").default(0),
    paused: (0, pg_core_1.boolean)("paused").default(false),
    paused_at: (0, pg_core_1.timestamp)("paused_at", { mode: "string" }),
    paused_total_seconds: (0, pg_core_1.integer)("paused_total_seconds").default(0),
    pause_count: (0, pg_core_1.integer)("pause_count").default(0),
    subject: (0, pg_core_1.text)("subject").default("general"),
    pomodoro_data: (0, pg_core_1.jsonb)("pomodoro_data"),
    outcome: (0, pg_core_1.text)("outcome"),
    buddy_match_key: (0, pg_core_1.text)("buddy_match_key"),
    shared_url_token: (0, pg_core_1.text)("shared_url_token").unique(),
    is_public: (0, pg_core_1.boolean)("is_public").default(false),
});
exports.session_participants = (0, pg_core_1.pgTable)("session_participants", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    owner_id: (0, pg_core_1.uuid)("owner_id").references(() => users_1.users.id, { onDelete: "set null" }), // Not needed here really, but kept for legacy
    session_id: (0, pg_core_1.uuid)("session_id").notNull().references(() => exports.sessions.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => users_1.users.id, { onDelete: "set null" }),
    guest_id: (0, pg_core_1.uuid)("guest_id"), // Reference to guest_users.id if not registered
    role: (0, pg_core_1.text)("role").default("member").notNull(), // 'host', 'member'
    joined_at: (0, pg_core_1.timestamp)("joined_at", { mode: "string" }).defaultNow().notNull()
}, (table) => ({
    session_participants_user_idx: (0, pg_core_1.index)("idx_session_participants_user").on(table.user_id)
}));
exports.voice_sessions = (0, pg_core_1.pgTable)("voice_sessions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    owner_id: (0, pg_core_1.uuid)("owner_id").references(() => users_1.users.id, { onDelete: "set null" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    channel_id: (0, pg_core_1.text)("channel_id").notNull(),
    started_at: (0, pg_core_1.timestamp)("started_at", { mode: "string" }).defaultNow().notNull(),
    last_seen_at: (0, pg_core_1.timestamp)("last_seen_at", { mode: "string" }).defaultNow(),
    ended_at: (0, pg_core_1.timestamp)("ended_at", { mode: "string" }),
    total_minutes: (0, pg_core_1.integer)("total_minutes").default(0),
    credited_minutes: (0, pg_core_1.integer)("credited_minutes").default(0),
    rewarded_minutes: (0, pg_core_1.integer)("rewarded_minutes").default(0),
    water_reward: (0, pg_core_1.integer)("water_reward").default(0),
    xp_reward: (0, pg_core_1.integer)("xp_reward").default(0),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    end_reason: (0, pg_core_1.text)("end_reason")
});
