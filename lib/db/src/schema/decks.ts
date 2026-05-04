import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cardsTable } from "./cards";

export const deckGameStyleEnum = [
  "aggro",
  "control",
  "midrange",
  "combo",
  "mill",
  "tank",
] as const;

export type DeckGameStyle = (typeof deckGameStyleEnum)[number];

export const decksTable = pgTable("decks", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  gameStyle: text("game_style").notNull(),
  strategy: text("strategy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const deckCardsTable = pgTable(
  "deck_cards",
  {
    id: serial("id").primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decksTable.id, { onDelete: "cascade" }),
    cardId: integer("card_id")
      .notNull()
      .references(() => cardsTable.id, { onDelete: "cascade" }),
    count: integer("count").default(1).notNull(),
    role: text("role"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    deckCardUnique: uniqueIndex("deck_cards_deck_id_card_id_unique").on(
      t.deckId,
      t.cardId,
    ),
  }),
);

export const insertDeckSchema = createInsertSchema(decksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertDeckCardSchema = createInsertSchema(deckCardsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDeck = z.infer<typeof insertDeckSchema>;
export type Deck = typeof decksTable.$inferSelect;
export type InsertDeckCard = z.infer<typeof insertDeckCardSchema>;
export type DeckCard = typeof deckCardsTable.$inferSelect;
