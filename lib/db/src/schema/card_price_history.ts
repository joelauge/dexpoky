import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { cardsTable } from "./cards";

export const cardPriceHistoryTable = pgTable("card_price_history", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cardsTable.id, { onDelete: "cascade" }),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  source: text("source"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export type CardPriceHistory = typeof cardPriceHistoryTable.$inferSelect;
