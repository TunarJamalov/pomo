import { pgTable, text, integer, boolean, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { users } from "./users";

export const garden_plots = pgTable("garden_plots", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plant_type: text("plant_type"),
  stage: integer("stage").default(0),
  water_used: integer("water_used").default(0),
  planted_at: timestamp("planted_at", { mode: "string" }).defaultNow(),
  last_watered: timestamp("last_watered", { mode: "string" }),
});

export const harvested_items = pgTable("harvested_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  plant_type: text("plant_type").notNull(),
  harvested_at: timestamp("harvested_at", { mode: "string" }).defaultNow(),
});

export const inventory = pgTable("inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  item_key: text("item_key").notNull(),
  quantity: integer("quantity").default(1),
}, (table) => ({
  user_item_idx: uniqueIndex("idx_inventory_user_item").on(table.user_id, table.item_key)
}));

export const user_pets = pgTable("user_pets", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pet_key: text("pet_key").notNull(),
  xp: integer("xp").default(0),
  level: integer("level").default(1),
  is_active: boolean("is_active").default(false),
  evolved: boolean("evolved").default(false),
});

export const user_achievements = pgTable("user_achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievement_key: text("achievement_key").notNull(),
  unlocked_at: timestamp("unlocked_at", { mode: "string" }).defaultNow(),
});

export const user_titles = pgTable("user_titles", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title_key: text("title_key").notNull(),
  unlocked_at: timestamp("unlocked_at", { mode: "string" }).defaultNow(),
});

export const seasons = pgTable("seasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  is_active: boolean("is_active").default(false),
  started_at: timestamp("started_at", { mode: "string" }).defaultNow(),
  ended_at: timestamp("ended_at", { mode: "string" }),
});

export const activity_rewards = pgTable("activity_rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source_type: text("source_type").notNull(),
  source_id: text("source_id"), // keep as integer since the original DB uses it for various sources
  title: text("title").default("Focus Session"),
  minutes: integer("minutes").default(0),
  water: integer("water").default(0),
  xp: integer("xp").default(0),
  streak: integer("streak").default(0),
  level: integer("level").default(1),
  leveled_up: boolean("leveled_up").default(false),
  created_at: timestamp("created_at", { mode: "string" }).defaultNow(),
  seen_at: timestamp("seen_at", { mode: "string" }),
});
