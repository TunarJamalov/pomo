"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clan_invites = exports.clan_members = exports.clan_inventory = exports.clans = exports.friends = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.friends = (0, pg_core_1.pgTable)("friends", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    sender_id: (0, pg_core_1.uuid)("sender_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    receiver_id: (0, pg_core_1.uuid)("receiver_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    status: (0, pg_core_1.text)("status").default("pending"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
});
exports.clans = (0, pg_core_1.pgTable)("clans", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.text)("name").notNull(),
    owner_id: (0, pg_core_1.uuid)("owner_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    total_focus_minutes: (0, pg_core_1.integer)("total_focus_minutes").default(0),
    xp: (0, pg_core_1.integer)("xp").default(0),
    season_xp: (0, pg_core_1.integer)("season_xp").default(0),
    level: (0, pg_core_1.integer)("level").default(1),
    water: (0, pg_core_1.integer)("water").default(0),
    tree_level: (0, pg_core_1.integer)("tree_level").default(1),
    tree_xp: (0, pg_core_1.integer)("tree_xp").default(0),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    last_dm_at: (0, pg_core_1.timestamp)("last_dm_at", { mode: "string" }),
});
exports.clan_inventory = (0, pg_core_1.pgTable)("clan_inventory", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    clan_id: (0, pg_core_1.uuid)("clan_id").notNull().references(() => exports.clans.id, { onDelete: "cascade" }),
    item_key: (0, pg_core_1.text)("item_key").notNull(),
    quantity: (0, pg_core_1.integer)("quantity").default(0),
});
exports.clan_members = (0, pg_core_1.pgTable)("clan_members", {
    clan_id: (0, pg_core_1.uuid)("clan_id").notNull().references(() => exports.clans.id, { onDelete: "cascade" }),
    user_id: (0, pg_core_1.uuid)("user_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    role: (0, pg_core_1.text)("role").default("member"),
    joined_at: (0, pg_core_1.timestamp)("joined_at", { mode: "string" }).defaultNow(),
}, (table) => ({
    pk: (0, pg_core_1.primaryKey)({ columns: [table.clan_id, table.user_id] }),
}));
exports.clan_invites = (0, pg_core_1.pgTable)("clan_invites", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    clan_id: (0, pg_core_1.uuid)("clan_id").notNull().references(() => exports.clans.id, { onDelete: "cascade" }),
    inviter_id: (0, pg_core_1.uuid)("inviter_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    invitee_id: (0, pg_core_1.uuid)("invitee_id").notNull().references(() => users_1.users.id, { onDelete: "cascade" }),
    status: (0, pg_core_1.text)("status").default("pending"),
    created_at: (0, pg_core_1.timestamp)("created_at", { mode: "string" }).defaultNow(),
    expires_at: (0, pg_core_1.timestamp)("expires_at", { mode: "string" }),
});
