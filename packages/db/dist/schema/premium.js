"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.premium_events = exports.premium_entitlements = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.premium_entitlements = (0, pg_core_1.pgTable)("premium_entitlements", {
    user_id: (0, pg_core_1.uuid)("user_id").primaryKey().references(() => users_1.users.id, { onDelete: "cascade" }),
    plan_key: (0, pg_core_1.text)("plan_key").default("pro_beta").notNull(),
    status: (0, pg_core_1.text)("status").default("active").notNull(),
    source: (0, pg_core_1.text)("source").default("manual_beta").notNull(),
    starts_at: (0, pg_core_1.timestamp)("starts_at", { mode: "string" }).defaultNow().notNull(),
    expires_at: (0, pg_core_1.timestamp)("expires_at", { mode: "string" }),
    granted_by: (0, pg_core_1.text)("granted_by"),
    note: (0, pg_core_1.text)("note"),
    provider_ref: (0, pg_core_1.text)("provider_ref"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
    revoked_at: (0, pg_core_1.timestamp)("revoked_at", { mode: "string" }),
});
exports.premium_events = (0, pg_core_1.pgTable)("premium_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    action: (0, pg_core_1.text)("action").notNull(),
    plan_key: (0, pg_core_1.text)("plan_key").notNull(),
    source: (0, pg_core_1.text)("source").notNull(),
    duration_days: (0, pg_core_1.integer)("duration_days"),
    actor_id: (0, pg_core_1.text)("actor_id"),
    note: (0, pg_core_1.text)("note"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
