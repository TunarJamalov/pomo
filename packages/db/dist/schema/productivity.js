"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.plan_signups = exports.study_plans = exports.goals = exports.documents = exports.notes = exports.tasks = exports.subjects = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const sessions_1 = require("./sessions");
exports.subjects = (0, pg_core_1.pgTable)("subjects", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    name: (0, pg_core_1.text)("name").notNull(),
    color: (0, pg_core_1.text)("color").default("#3B82F6"), // Default Tailwind Blue
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.tasks = (0, pg_core_1.pgTable)("tasks", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    subject_id: (0, pg_core_1.uuid)("subject_id").references(() => exports.subjects.id, { onDelete: "set null" }),
    session_id: (0, pg_core_1.uuid)("session_id").references(() => sessions_1.sessions.id, { onDelete: "set null" }),
    content: (0, pg_core_1.text)("content").notNull(),
    completed: (0, pg_core_1.boolean)("completed").default(false).notNull(),
    focus_minutes: (0, pg_core_1.integer)("focus_minutes").default(0).notNull(),
    priority: (0, pg_core_1.text)("priority").default("medium").notNull(), // 'low', 'medium', 'high'
    deadline: (0, pg_core_1.timestamp)("deadline", { mode: "string" }),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    completed_at: (0, pg_core_1.timestamp)("completed_at", { mode: "string" })
});
exports.notes = (0, pg_core_1.pgTable)("notes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    subject_id: (0, pg_core_1.uuid)("subject_id").references(() => exports.subjects.id, { onDelete: "set null" }),
    title: (0, pg_core_1.text)("title").notNull(),
    content_rich: (0, pg_core_1.text)("content_rich").default(""),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
});
exports.documents = (0, pg_core_1.pgTable)("documents", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    subject_id: (0, pg_core_1.uuid)("subject_id").references(() => exports.subjects.id, { onDelete: "set null" }),
    title: (0, pg_core_1.text)("title").notNull(),
    file_path: (0, pg_core_1.text)("file_path").notNull(),
    file_type: (0, pg_core_1.text)("file_type").default("pdf"),
    size_bytes: (0, pg_core_1.integer)("size_bytes").default(0),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.goals = (0, pg_core_1.pgTable)("goals", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    type: (0, pg_core_1.text)("type").notNull(), // 'focus_hours', 'tasks_completed', etc.
    target_value: (0, pg_core_1.integer)("target_value").notNull(),
    current_value: (0, pg_core_1.integer)("current_value").default(0).notNull(),
    deadline: (0, pg_core_1.timestamp)("deadline", { mode: "string" }),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.study_plans = (0, pg_core_1.pgTable)("study_plans", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    host_id: (0, pg_core_1.uuid)("host_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    channel_id: (0, pg_core_1.text)("channel_id").notNull(),
    message_id: (0, pg_core_1.text)("message_id"),
    title: (0, pg_core_1.text)("title").notNull(),
    scheduled_at: (0, pg_core_1.timestamp)("scheduled_at", { mode: "string" }).notNull(),
    duration: (0, pg_core_1.integer)("duration").notNull(),
    break_duration: (0, pg_core_1.integer)("break_duration"),
    cycles: (0, pg_core_1.integer)("cycles").default(4),
    limit_count: (0, pg_core_1.integer)("limit_count").default(10),
    status: (0, pg_core_1.text)("status").default("open").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.plan_signups = (0, pg_core_1.pgTable)("plan_signups", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    plan_id: (0, pg_core_1.uuid)("plan_id").notNull().references(() => exports.study_plans.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    signed_up_at: (0, pg_core_1.timestamp)("signed_up_at", { mode: "string" }).defaultNow().notNull(),
});
