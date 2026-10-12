"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.challenge_members = exports.challenges = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.challenges = (0, pg_core_1.pgTable)("challenges", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    creator_id: (0, pg_core_1.uuid)("creator_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    guild_id: (0, pg_core_1.text)("guild_id"), // Nullable?
    title: (0, pg_core_1.text)("title").notNull(),
    challenge_type: (0, pg_core_1.text)("challenge_type").notNull(),
    target_value: (0, pg_core_1.integer)("target_value").notNull(),
    start_date: (0, pg_core_1.timestamp)("start_date", { mode: "string" }).notNull(),
    end_date: (0, pg_core_1.timestamp)("end_date", { mode: "string" }).notNull(),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.challenge_members = (0, pg_core_1.pgTable)("challenge_members", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    challenge_id: (0, pg_core_1.uuid)("challenge_id").notNull().references(() => exports.challenges.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    progress: (0, pg_core_1.integer)("progress").default(0).notNull(),
    joined_at: (0, pg_core_1.timestamp)("joined_at", { mode: "string" }).defaultNow().notNull(),
});
