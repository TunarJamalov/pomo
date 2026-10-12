import { pgTable, text, integer, boolean, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { users } from "./users";

export const friends = pgTable("friends", {
  id: uuid("id").primaryKey().defaultRandom(),
  sender_id: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiver_id: uuid("receiver_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("pending"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
});

export const clans = pgTable("clans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  owner_id: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  total_focus_minutes: integer("total_focus_minutes").default(0),
  xp: integer("xp").default(0),
  season_xp: integer("season_xp").default(0),
  level: integer("level").default(1),
  water: integer("water").default(0),
  tree_level: integer("tree_level").default(1),
  tree_xp: integer("tree_xp").default(0),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  last_dm_at: timestamp("last_dm_at", { mode: "string" }),
});

export const clan_inventory = pgTable("clan_inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  clan_id: uuid("clan_id").notNull().references(() => clans.id, { onDelete: "cascade" }),
  item_key: text("item_key").notNull(),
  quantity: integer("quantity").default(0),
});

export const clan_members = pgTable("clan_members", {
  clan_id: uuid("clan_id").notNull().references(() => clans.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").default("member"),
  joined_at: timestamp("joined_at", { mode: "string" }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.clan_id, table.user_id] }),
}));

export const clan_invites = pgTable("clan_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  clan_id: uuid("clan_id").notNull().references(() => clans.id, { onDelete: "cascade" }),
  inviter_id: uuid("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitee_id: uuid("invitee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").default("pending"),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  expires_at: timestamp("expires_at", { mode: "string" }),
});
