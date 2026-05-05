import { integer, pgTable, serial, text, timestamp, numeric } from "drizzle-orm/pg-core";
import { cardsTable } from "./cards";

export const groupSharesTable = pgTable("group_shares", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title"),
  askingPrice: numeric("asking_price", { precision: 10, scale: 2 }),
  shippingCost: numeric("shipping_cost", { precision: 10, scale: 2 }),
  clerkId: text("clerk_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const groupShareCardsTable = pgTable("group_share_cards", {
  id: serial("id").primaryKey(),
  groupShareId: integer("group_share_id")
    .notNull()
    .references(() => groupSharesTable.id, { onDelete: "cascade" }),
  cardId: integer("card_id")
    .notNull()
    .references(() => cardsTable.id, { onDelete: "cascade" }),
  images: text("images").array().notNull().default([]),
  video: text("video"),
  displayOrder: integer("display_order").notNull().default(0),
});

export type GroupShare = typeof groupSharesTable.$inferSelect;
export type GroupShareCard = typeof groupShareCardsTable.$inferSelect;
