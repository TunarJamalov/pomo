import { pgTable, text, integer, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";
import { sessions } from "./sessions";

export const subjects = pgTable("subjects", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#3B82F6"), // Default Tailwind Blue
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject_id: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  session_id: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
  content: text("content").notNull(),
  completed: boolean("completed").default(false).notNull(),
  focus_minutes: integer("focus_minutes").default(0).notNull(),
  priority: text("priority").default("medium").notNull(), // 'low', 'medium', 'high'
  deadline: timestamp("deadline", { mode: "string" }),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  completed_at: timestamp("completed_at", { mode: "string" })
});

export const notes = pgTable("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject_id: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  content_rich: text("content_rich").default(""),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  subject_id: uuid("subject_id").references(() => subjects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  file_path: text("file_path").notNull(),
  file_type: text("file_type").default("pdf"),
  size_bytes: integer("size_bytes").default(0),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'focus_hours', 'tasks_completed', etc.
  target_value: integer("target_value").notNull(),
  current_value: integer("current_value").default(0).notNull(),
  deadline: timestamp("deadline", { mode: "string" }),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const study_plans = pgTable("study_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  host_id: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  guild_id: text("guild_id").notNull(),
  channel_id: text("channel_id").notNull(),
  message_id: text("message_id"),
  title: text("title").notNull(),
  scheduled_at: timestamp("scheduled_at", { mode: "string" }).notNull(),
  duration: integer("duration").notNull(),
  break_duration: integer("break_duration"),
  cycles: integer("cycles").default(4),
  limit_count: integer("limit_count").default(10),
  status: text("status").default("open").notNull(),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
});

export const plan_signups = pgTable("plan_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  plan_id: uuid("plan_id").notNull().references(() => study_plans.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  signed_up_at: timestamp("signed_up_at", { mode: "string" }).defaultNow().notNull(),
});
