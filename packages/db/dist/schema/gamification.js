"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activity_rewards = exports.seasons = exports.user_titles = exports.user_achievements = exports.user_pets = exports.inventory = exports.harvested_items = exports.garden_plots = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.garden_plots = (0, pg_core_1.pgTable)("garden_plots", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    plant_type: (0, pg_core_1.text)("plant_type"),
    stage: (0, pg_core_1.integer)("stage").default(0),
    water_used: (0, pg_core_1.integer)("water_used").default(0),
    planted_at: (0, pg_core_1.timestamp)("planted_at", { mode: "string" }).defaultNow(),
    last_watered: (0, pg_core_1.timestamp)("last_watered", { mode: "string" }),
});
exports.harvested_items = (0, pg_core_1.pgTable)("harvested_items", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    plant_type: (0, pg_core_1.text)("plant_type").notNull(),
    harvested_at: (0, pg_core_1.timestamp)("harvested_at", { mode: "string" }).defaultNow(),
});
exports.inventory = (0, pg_core_1.pgTable)("inventory", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    item_key: (0, pg_core_1.text)("item_key").notNull(),
    quantity: (0, pg_core_1.integer)("quantity").default(1),
}, (table) => ({
    user_item_idx: (0, pg_core_1.uniqueIndex)("idx_inventory_user_item").on(table.user_id, table.item_key)
}));
exports.user_pets = (0, pg_core_1.pgTable)("user_pets", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    pet_key: (0, pg_core_1.text)("pet_key").notNull(),
    xp: (0, pg_core_1.integer)("xp").default(0),
    level: (0, pg_core_1.integer)("level").default(1),
    is_active: (0, pg_core_1.boolean)("is_active").default(false),
    evolved: (0, pg_core_1.boolean)("evolved").default(false),
});
exports.user_achievements = (0, pg_core_1.pgTable)("user_achievements", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    achievement_key: (0, pg_core_1.text)("achievement_key").notNull(),
    unlocked_at: (0, pg_core_1.timestamp)("unlocked_at", { mode: "string" }).defaultNow(),
});
exports.user_titles = (0, pg_core_1.pgTable)("user_titles", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    title_key: (0, pg_core_1.text)("title_key").notNull(),
    unlocked_at: (0, pg_core_1.timestamp)("unlocked_at", { mode: "string" }).defaultNow(),
});
exports.seasons = (0, pg_core_1.pgTable)("seasons", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull(),
    is_active: (0, pg_core_1.boolean)("is_active").default(false),
    started_at: (0, pg_core_1.timestamp)("started_at", { mode: "string" }).defaultNow(),
    ended_at: (0, pg_core_1.timestamp)("ended_at", { mode: "string" }),
});
exports.activity_rewards = (0, pg_core_1.pgTable)("activity_rewards", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    source_type: (0, pg_core_1.text)("source_type").notNull(),
    source_id: (0, pg_core_1.text)("source_id"), // keep as integer since the original DB uses it for various sources
    title: (0, pg_core_1.text)("title").default("Focus Session"),
    minutes: (0, pg_core_1.integer)("minutes").default(0),
    water: (0, pg_core_1.integer)("water").default(0),
    xp: (0, pg_core_1.integer)("xp").default(0),
    streak: (0, pg_core_1.integer)("streak").default(0),
    level: (0, pg_core_1.integer)("level").default(1),
    leveled_up: (0, pg_core_1.boolean)("leveled_up").default(false),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    seen_at: (0, pg_core_1.timestamp)("seen_at", { mode: "string" }),
});
