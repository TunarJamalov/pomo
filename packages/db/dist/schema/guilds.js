"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guild_installations = exports.guild_quests = exports.guild_progress = exports.guild_settings = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.guild_settings = (0, pg_core_1.pgTable)("guild_settings", {
    guild_id: (0, pg_core_1.text)("guild_id").primaryKey(), // Discord Snowflake
    report_channel_id: (0, pg_core_1.text)("report_channel_id"),
    report_enabled: (0, pg_core_1.boolean)("report_enabled").default(false),
    voice_tracking_enabled: (0, pg_core_1.boolean)("voice_tracking_enabled").default(false),
    voice_target_id: (0, pg_core_1.text)("voice_target_id"),
    voice_target_type: (0, pg_core_1.text)("voice_target_type"),
    voice_rewards_enabled: (0, pg_core_1.boolean)("voice_rewards_enabled").default(true),
    voice_min_minutes: (0, pg_core_1.integer)("voice_min_minutes").default(10),
    voice_daily_reward_cap: (0, pg_core_1.integer)("voice_daily_reward_cap").default(240),
    language: (0, pg_core_1.text)("language").default("en"),
    timezone: (0, pg_core_1.text)("timezone").default("UTC"),
    report_last_week_start: (0, pg_core_1.text)("report_last_week_start"),
    setup_completed_at: (0, pg_core_1.timestamp)("setup_completed_at", { mode: "string" }),
    studyroom_category_id: (0, pg_core_1.text)("studyroom_category_id"),
    total_focus_minutes: (0, pg_core_1.integer)("total_focus_minutes").default(0),
    guild_name: (0, pg_core_1.text)("guild_name"),
    goal_enabled: (0, pg_core_1.boolean)("goal_enabled").default(false),
    goal_target_minutes: (0, pg_core_1.integer)("goal_target_minutes").default(2500),
    goal_channel_id: (0, pg_core_1.text)("goal_channel_id"),
    goal_min_contribution: (0, pg_core_1.integer)("goal_min_contribution").default(25),
    studyroom_trigger_id: (0, pg_core_1.text)("studyroom_trigger_id"),
    global_buddy_matching_enabled: (0, pg_core_1.boolean)("global_buddy_matching_enabled").default(false),
    study_hub_enabled: (0, pg_core_1.boolean)("study_hub_enabled").default(false),
    study_hub_accepts_guests: (0, pg_core_1.boolean)("study_hub_accepts_guests").default(false),
});
exports.guild_progress = (0, pg_core_1.pgTable)("guild_progress", {
    guild_id: (0, pg_core_1.text)("guild_id").primaryKey(), // References guild_settings informally
    guild_name: (0, pg_core_1.text)("guild_name"),
    level: (0, pg_core_1.integer)("level").default(1).notNull(),
    xp: (0, pg_core_1.integer)("xp").default(0).notNull(),
    total_focus_minutes: (0, pg_core_1.integer)("total_focus_minutes").default(0).notNull(),
    total_sessions: (0, pg_core_1.integer)("total_sessions").default(0).notNull(),
    season_xp: (0, pg_core_1.integer)("season_xp").default(0).notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow(),
});
exports.guild_quests = (0, pg_core_1.pgTable)("guild_quests", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    week_start: (0, pg_core_1.text)("week_start").notNull(),
    quest_key: (0, pg_core_1.text)("quest_key").notNull(),
    title: (0, pg_core_1.text)("title").notNull(),
    description: (0, pg_core_1.text)("description").notNull(),
    target: (0, pg_core_1.integer)("target").notNull(),
    progress: (0, pg_core_1.integer)("progress").default(0).notNull(),
    reward_water: (0, pg_core_1.integer)("reward_water").default(0).notNull(),
    reward_xp: (0, pg_core_1.integer)("reward_xp").default(0).notNull(),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    completed_at: (0, pg_core_1.timestamp)("completed_at", { mode: "string" }),
});
exports.guild_installations = (0, pg_core_1.pgTable)("guild_installations", {
    guild_id: (0, pg_core_1.text)("guild_id").primaryKey(),
    guild_name: (0, pg_core_1.text)("guild_name"),
    member_count: (0, pg_core_1.integer)("member_count").default(0),
    owner_id: (0, pg_core_1.uuid)("owner_id").references(() => users_1.users.id, { onDelete: "set null" }), // Was discord TEXT
    active: (0, pg_core_1.boolean)("active").default(true),
    is_baseline: (0, pg_core_1.boolean)("is_baseline").default(true),
    setup_reminder_sent_at: (0, pg_core_1.timestamp)("setup_reminder_sent_at", { mode: "string" }),
    setup_reminder_attempted_at: (0, pg_core_1.timestamp)("setup_reminder_attempted_at", { mode: "string" }),
    setup_nudge_sent_at: (0, pg_core_1.timestamp)("setup_nudge_sent_at", { mode: "string" }),
    joined_at: (0, pg_core_1.timestamp)("joined_at", { mode: "string" }).defaultNow(),
    left_at: (0, pg_core_1.timestamp)("left_at", { mode: "string" }),
    last_seen_at: (0, pg_core_1.timestamp)("last_seen_at", { mode: "string" }).defaultNow(),
});
