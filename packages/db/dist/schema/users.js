"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.guest_users = exports.settings = exports.user_identities = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    water: (0, pg_core_1.integer)("water").default(0).notNull(),
    total_focus_minutes: (0, pg_core_1.integer)("total_focus_minutes").default(0).notNull(),
    xp: (0, pg_core_1.integer)("xp").default(0).notNull(),
    level: (0, pg_core_1.integer)("level").default(1).notNull(),
    streak: (0, pg_core_1.integer)("streak").default(0).notNull(),
    last_study_date: (0, pg_core_1.timestamp)("last_study_date", { mode: "string" }),
    last_daily_date: (0, pg_core_1.timestamp)("last_daily_date", { mode: "string" }),
    premium: (0, pg_core_1.integer)("premium").default(0).notNull(),
    bio: (0, pg_core_1.text)("bio").default(""),
    theme: (0, pg_core_1.text)("theme").default("basic"),
    active_title_key: (0, pg_core_1.text)("active_title_key"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    season_xp: (0, pg_core_1.integer)("season_xp").default(0).notNull(),
    season_focus_minutes: (0, pg_core_1.integer)("season_focus_minutes").default(0).notNull(),
    referred_by: (0, pg_core_1.uuid)("referred_by"),
    last_premium_daily_date: (0, pg_core_1.timestamp)("last_premium_daily_date", { mode: "string" }),
    active_buff_type: (0, pg_core_1.text)("active_buff_type"),
    active_buff_value: (0, pg_core_1.real)("active_buff_value").default(0),
    buff_expires_at: (0, pg_core_1.timestamp)("buff_expires_at", { mode: "string" }),
    total_sessions: (0, pg_core_1.integer)("total_sessions").default(0).notNull(),
    last_loyal_dog_date: (0, pg_core_1.timestamp)("last_loyal_dog_date", { mode: "string" })
});
exports.user_identities = (0, pg_core_1.pgTable)("user_identities", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => exports.users.id, { onDelete: "cascade" }),
    provider: (0, pg_core_1.text)("provider").notNull(),
    provider_id: (0, pg_core_1.text)("provider_id").notNull(),
}, (table) => ({
    provider_provider_id_idx: (0, pg_core_1.uniqueIndex)("idx_user_identities_provider").on(table.provider, table.provider_id)
}));
exports.settings = (0, pg_core_1.pgTable)("settings", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => exports.users.id, { onDelete: "cascade" }),
    notify_before_end: (0, pg_core_1.boolean)("notify_before_end").default(true).notNull(),
    notify_type: (0, pg_core_1.text)("notify_type").default("dm").notNull(),
    reminders_enabled: (0, pg_core_1.boolean)("reminders_enabled").default(true).notNull(),
    notify_friends: (0, pg_core_1.boolean)("notify_friends").default(false).notNull()
});
exports.guest_users = (0, pg_core_1.pgTable)("guest_users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    token: (0, pg_core_1.text)("token").notNull().unique(),
    display_name: (0, pg_core_1.text)("display_name").default("Guest"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow().notNull(),
    expires_at: (0, pg_core_1.timestamp)("expires_at", { mode: "string" }).notNull(),
});
