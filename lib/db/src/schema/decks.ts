import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  uniqueIndex,
  numeric,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cardsTable } from "./cards";
import { wishlistItemsTable } from "./wishlist";

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

/**
 * A deck card row references EITHER an owned card (`cardId`) OR a catalog
 * card (`catalogCardId`, optionally backed by a `wishlistItemId`).
 *
 * Snapshot fields (`snapshotName`, `snapshotImageUrl`, etc.) cache the catalog
 * card's metadata so the deck still renders if the wishlist item is removed.
 */
export const deckCardsTable = pgTable(
  "deck_cards",
  {
    id: serial("id").primaryKey(),
    deckId: integer("deck_id")
      .notNull()
      .references(() => decksTable.id, { onDelete: "cascade" }),
    cardId: integer("card_id").references(() => cardsTable.id, {
      onDelete: "cascade",
    }),
    catalogCardId: text("catalog_card_id"),
    wishlistItemId: integer("wishlist_item_id").references(
      () => wishlistItemsTable.id,
      { onDelete: "set null" },
    ),
    snapshotName: text("snapshot_name"),
    snapshotImageUrl: text("snapshot_image_url"),
    snapshotSetName: text("snapshot_set_name"),
    snapshotCardNumber: text("snapshot_card_number"),
    count: integer("count").default(1).notNull(),
    role: text("role"),
    notes: text("notes"),
    recommendationConfidence: numeric("recommendation_confidence", { precision: 4, scale: 3 }),
    strategicScores: jsonb("strategic_scores"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    deckCardUnique: uniqueIndex("deck_cards_deck_id_card_id_unique").on(
      t.deckId,
      t.cardId,
    ),
    deckCatalogCardUnique: uniqueIndex("deck_cards_deck_id_catalog_card_unique").on(
      t.deckId,
      t.catalogCardId,
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
