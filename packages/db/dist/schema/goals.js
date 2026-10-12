"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.user_exams = exports.personal_goal_contributions = exports.personal_goals = exports.personal_goal_settings = exports.guild_goal_claims = exports.guild_goal_contributions = exports.guild_goals = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.guild_goals = (0, pg_core_1.pgTable)("guild_goals", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    week_start: (0, pg_core_1.text)("week_start").notNull(),
    target_minutes: (0, pg_core_1.integer)("target_minutes").notNull(),
    reward_water: (0, pg_core_1.integer)("reward_water").default(0).notNull(),
    reward_xp: (0, pg_core_1.integer)("reward_xp").default(0).notNull(),
    min_contribution: (0, pg_core_1.integer)("min_contribution").default(0).notNull(),
    channel_id: (0, pg_core_1.text)("channel_id"),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    completed_at: (0, pg_core_1.timestamp)("completed_at", { mode: "string" }),
});
exports.guild_goal_contributions = (0, pg_core_1.pgTable)("guild_goal_contributions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    goal_id: (0, pg_core_1.uuid)("goal_id").notNull().references(() => exports.guild_goals.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    minutes: (0, pg_core_1.integer)("minutes").default(0).notNull(),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id").notNull(), // Polymorphic, could be UUID
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.guild_goal_claims = (0, pg_core_1.pgTable)("guild_goal_claims", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    goal_id: (0, pg_core_1.uuid)("goal_id").notNull().references(() => exports.guild_goals.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    claimed_at: (0, pg_core_1.timestamp)("claimed_at", { mode: "string" }).defaultNow().notNull(),
});
exports.personal_goal_settings = (0, pg_core_1.pgTable)("personal_goal_settings", {
    user_id: (0, pg_core_1.uuid)("user_id").primaryKey().references(() => users_1.users.id, { onDelete: "cascade" }),
    enabled: (0, pg_core_1.boolean)("enabled").default(false).notNull(),
    period_type: (0, pg_core_1.text)("period_type").default("weekly").notNull(),
    target_minutes: (0, pg_core_1.integer)("target_minutes").default(0).notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
});
exports.personal_goals = (0, pg_core_1.pgTable)("personal_goals", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    period_type: (0, pg_core_1.text)("period_type").notNull(),
    period_start: (0, pg_core_1.text)("period_start").notNull(),
    period_end: (0, pg_core_1.text)("period_end").notNull(),
    target_minutes: (0, pg_core_1.integer)("target_minutes").notNull(),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    completed_at: (0, pg_core_1.timestamp)("completed_at", { mode: "string" }),
});
exports.personal_goal_contributions = (0, pg_core_1.pgTable)("personal_goal_contributions", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    goal_id: (0, pg_core_1.uuid)("goal_id").notNull().references(() => exports.personal_goals.id, { onDelete: "cascade" }),
    minutes: (0, pg_core_1.integer)("minutes").notNull(),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.user_exams = (0, pg_core_1.pgTable)("user_exams", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    title: (0, pg_core_1.text)("title").notNull(),
    exam_date: (0, pg_core_1.timestamp)("exam_date", { mode: "string" }).notNull(),
    target_hours: (0, pg_core_1.integer)("target_hours").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
