"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.market_prices = exports.quest_claims = exports.pending_transfers = exports.pro_profile_settings = exports.streak_breaks = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.streak_breaks = (0, pg_core_1.pgTable)("streak_breaks", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    previous_streak: (0, pg_core_1.integer)("previous_streak").notNull(),
    gap_days: (0, pg_core_1.integer)("gap_days").notNull(),
    broken_at: (0, pg_core_1.timestamp)("broken_at", { mode: "string" }).notNull(),
    expires_at: (0, pg_core_1.timestamp)("expires_at", { mode: "string" }).notNull(),
    recovered_at: (0, pg_core_1.timestamp)("recovered_at", { mode: "string" }),
});
exports.pro_profile_settings = (0, pg_core_1.pgTable)("pro_profile_settings", {
    user_id: (0, pg_core_1.uuid)("user_id").primaryKey().references(() => users_1.users.id, { onDelete: "cascade" }),
    accent_key: (0, pg_core_1.text)("accent_key"),
    badge_key: (0, pg_core_1.text)("badge_key"),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
});
exports.pending_transfers = (0, pg_core_1.pgTable)("pending_transfers", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    sender_id: (0, pg_core_1.uuid)("sender_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    receiver_id: (0, pg_core_1.uuid)("receiver_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    amount: (0, pg_core_1.integer)("amount").notNull(),
    reason: (0, pg_core_1.text)("reason"),
    status: (0, pg_core_1.text)("status").default("pending").notNull(),
    log_message_id: (0, pg_core_1.text)("log_message_id"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
});
exports.quest_claims = (0, pg_core_1.pgTable)("quest_claims", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(), // Was INTEGER
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    quest_key: (0, pg_core_1.text)("quest_key").notNull(),
    quest_date: (0, pg_core_1.text)("quest_date").notNull(),
    claimed_at: (0, pg_core_1.timestamp)("claimed_at", { mode: "string" }).defaultNow().notNull(),
});
exports.market_prices = (0, pg_core_1.pgTable)("market_prices", {
    item_key: (0, pg_core_1.text)("item_key").primaryKey(),
    price: (0, pg_core_1.integer)("price").notNull(),
    updated_at: (0, pg_core_1.timestamp)("updated_at", { mode: "string" }).defaultNow().notNull(),
});
