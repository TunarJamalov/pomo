"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quest_notifications = exports.runtime_state = exports.user_onboarding = exports.onboarding_events = exports.command_usage = exports.guild_quest_claims = exports.guild_quest_contributions = exports.guild_xp_events = exports.activity_chat = exports.activity_commands = exports.global_event_contributions = exports.global_event_clues = exports.global_events = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const guilds_1 = require("./guilds");
exports.global_events = (0, pg_core_1.pgTable)("global_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    event_key: (0, pg_core_1.text)("event_key").notNull(),
    title: (0, pg_core_1.text)("title").notNull(),
    description: (0, pg_core_1.text)("description"),
    target_minutes: (0, pg_core_1.integer)("target_minutes").notNull(),
    progress_minutes: (0, pg_core_1.integer)("progress_minutes").default(0).notNull(),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    started_at: (0, pg_core_1.timestamp)("started_at", { mode: "string" }).notNull(),
    completed_at: (0, pg_core_1.timestamp)("completed_at", { mode: "string" }),
});
exports.global_event_clues = (0, pg_core_1.pgTable)("global_event_clues", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    event_id: (0, pg_core_1.uuid)("event_id").notNull().references(() => exports.global_events.id, { onDelete: "cascade" }),
    clue_key: (0, pg_core_1.text)("clue_key").notNull(),
    threshold_minutes: (0, pg_core_1.integer)("threshold_minutes").notNull(),
    clue_text: (0, pg_core_1.text)("clue_text").notNull(),
});
exports.global_event_contributions = (0, pg_core_1.pgTable)("global_event_contributions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    event_id: (0, pg_core_1.uuid)("event_id").notNull().references(() => exports.global_events.id, { onDelete: "cascade" }),
    guild_id: (0, pg_core_1.text)("guild_id"), // Optional
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id").notNull(),
    minutes: (0, pg_core_1.integer)("minutes").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.activity_commands = (0, pg_core_1.pgTable)("activity_commands", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    channel_id: (0, pg_core_1.text)("channel_id").notNull(),
    minutes: (0, pg_core_1.integer)("minutes").notNull(),
    status: (0, pg_core_1.text)("status").default("pending").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    type: (0, pg_core_1.text)("type").default("study").notNull(),
    extra_data: (0, pg_core_1.text)("extra_data"),
});
exports.activity_chat = (0, pg_core_1.pgTable)("activity_chat", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    username: (0, pg_core_1.text)("username").notNull(),
    avatar: (0, pg_core_1.text)("avatar"),
    level: (0, pg_core_1.integer)("level").notNull(),
    message: (0, pg_core_1.text)("message").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.guild_xp_events = (0, pg_core_1.pgTable)("guild_xp_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id").notNull(),
    minutes: (0, pg_core_1.integer)("minutes").notNull(),
    xp: (0, pg_core_1.integer)("xp").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.guild_quest_contributions = (0, pg_core_1.pgTable)("guild_quest_contributions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    quest_id: (0, pg_core_1.uuid)("quest_id").notNull().references(() => guilds_1.guild_quests.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id").notNull(),
    minutes: (0, pg_core_1.integer)("minutes").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.guild_quest_claims = (0, pg_core_1.pgTable)("guild_quest_claims", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    quest_id: (0, pg_core_1.uuid)("quest_id").notNull().references(() => guilds_1.guild_quests.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    claimed_at: (0, pg_core_1.timestamp)("claimed_at", { mode: "string" }).defaultNow().notNull(),
});
exports.command_usage = (0, pg_core_1.pgTable)("command_usage", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    guild_id: (0, pg_core_1.text)("guild_id"), // Nullable?
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    command_name: (0, pg_core_1.text)("command_name").notNull(),
    subcommand_name: (0, pg_core_1.text)("subcommand_name"),
    used_at: (0, pg_core_1.timestamp)("used_at", { mode: "string" }).defaultNow().notNull(),
});
exports.onboarding_events = (0, pg_core_1.pgTable)("onboarding_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    guild_id: (0, pg_core_1.text)("guild_id"), // Nullable
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    event_type: (0, pg_core_1.text)("event_type").notNull(),
    topic: (0, pg_core_1.text)("topic"), // nullable: source SQLite data contains null topic values
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.user_onboarding = (0, pg_core_1.pgTable)("user_onboarding", {
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    tip_key: (0, pg_core_1.text)("tip_key").notNull(),
    shown_at: (0, pg_core_1.timestamp)("shown_at", { mode: "string" }).defaultNow().notNull(),
});
exports.runtime_state = (0, pg_core_1.pgTable)("runtime_state", {
    key: (0, pg_core_1.text)("key").primaryKey(),
    value: (0, pg_core_1.text)("value").notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
});
exports.quest_notifications = (0, pg_core_1.pgTable)("quest_notifications", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    quest_key: (0, pg_core_1.text)("quest_key").notNull(),
    quest_date: (0, pg_core_1.text)("quest_date").notNull(),
    notified_at: (0, pg_core_1.timestamp)("notified_at", { mode: "string" }).defaultNow().notNull(),
});
