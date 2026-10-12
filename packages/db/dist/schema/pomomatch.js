"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buddy_analytics_events = exports.buddy_hub_invites = exports.buddy_hub_consents = exports.buddy_reports = exports.buddy_unmatches = exports.buddy_blocks = exports.buddy_swipes = exports.buddy_requests = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.buddy_requests = (0, pg_core_1.pgTable)("buddy_requests", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Notice: Was INTEGER PK, changed to UUID
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    guild_id: (0, pg_core_1.text)("guild_id").notNull(),
    subject: (0, pg_core_1.text)("subject"),
    duration: (0, pg_core_1.integer)("duration"),
    mode: (0, pg_core_1.text)("mode").default("silent"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    status: (0, pg_core_1.text)("status").default("waiting").notNull(),
    matched_user_id: (0, pg_core_1.uuid)("matched_user_id").references(() => users_1.users.id, { onDelete: "set null" }), // Was TEXT
    match_score: (0, pg_core_1.integer)("match_score").default(0),
    session_channel_id: (0, pg_core_1.text)("session_channel_id"),
    ended_at: (0, pg_core_1.timestamp)("ended_at", { mode: "string" }),
    destination: (0, pg_core_1.text)("destination").default("pending"),
}, (table) => ({
    buddy_requests_status_idx: (0, pg_core_1.index)("idx_buddy_requests_status").on(table.status)
}));
exports.buddy_swipes = (0, pg_core_1.pgTable)("buddy_swipes", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    swiper_id: (0, pg_core_1.uuid)("swiper_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    target_user_id: (0, pg_core_1.uuid)("target_user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    target_request_id: (0, pg_core_1.uuid)("target_request_id").notNull().references(() => exports.buddy_requests.id, { onDelete: "cascade" }), // Was INTEGER
    action: (0, pg_core_1.text)("action").default("like").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
    swiper_target_req_idx: (0, pg_core_1.uniqueIndex)("idx_buddy_swipes_unique").on(table.swiper_id, table.target_request_id)
}));
exports.buddy_blocks = (0, pg_core_1.pgTable)("buddy_blocks", {
    blocker_id: (0, pg_core_1.uuid)("blocker_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    blocked_id: (0, pg_core_1.uuid)("blocked_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
    blocker_blocked_idx: (0, pg_core_1.uniqueIndex)("idx_buddy_blocks_unique").on(table.blocker_id, table.blocked_id)
}));
exports.buddy_unmatches = (0, pg_core_1.pgTable)("buddy_unmatches", {
    unmatcher_id: (0, pg_core_1.uuid)("unmatcher_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    unmatched_id: (0, pg_core_1.uuid)("unmatched_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
}, (table) => ({
    unmatcher_unmatched_idx: (0, pg_core_1.uniqueIndex)("idx_buddy_unmatches_unique").on(table.unmatcher_id, table.unmatched_id)
}));
exports.buddy_reports = (0, pg_core_1.pgTable)("buddy_reports", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    reporter_user_id: (0, pg_core_1.uuid)("reporter_user_id").references(() => users_1.users.id, { onDelete: "set null" }), // Reporter deletion = report deletion
    reported_user_id: (0, pg_core_1.uuid)("reported_user_id").references(() => users_1.users.id, { onDelete: "set null" }), // If reported user is deleted, keep the report
    request_id: (0, pg_core_1.uuid)("request_id"),
    reason: (0, pg_core_1.text)("reason").notNull(),
    description: (0, pg_core_1.text)("description"),
    status: (0, pg_core_1.text)("status").default("open").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
});
exports.buddy_hub_consents = (0, pg_core_1.pgTable)("buddy_hub_consents", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    match_key: (0, pg_core_1.text)("match_key").notNull(),
    request_id: (0, pg_core_1.uuid)("request_id").notNull().references(() => exports.buddy_requests.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    decision: (0, pg_core_1.text)("decision").default("pending").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow(),
}, (table) => ({
    match_user_idx: (0, pg_core_1.uniqueIndex)("idx_buddy_hub_consents_unique").on(table.match_key, table.user_id)
}));
exports.buddy_hub_invites = (0, pg_core_1.pgTable)("buddy_hub_invites", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    match_key: (0, pg_core_1.text)("match_key").notNull().unique(),
    hub_guild_id: (0, pg_core_1.text)("hub_guild_id").notNull(),
    invite_url: (0, pg_core_1.text)("invite_url"),
    invite_code: (0, pg_core_1.text)("invite_code"),
    status: (0, pg_core_1.text)("status").default("pending").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    sent_at: (0, pg_core_1.timestamp)("sent_at", { mode: "string" }),
});
exports.buddy_analytics_events = (0, pg_core_1.pgTable)("buddy_analytics_events", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    event_name: (0, pg_core_1.text)("event_name").notNull(),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => users_1.users.id, { onDelete: "set null" }),
    guild_id: (0, pg_core_1.text)("guild_id"),
    request_id: (0, pg_core_1.uuid)("request_id"),
    match_key: (0, pg_core_1.text)("match_key"),
    scope: (0, pg_core_1.text)("scope"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
});
