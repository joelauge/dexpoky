import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  boolean,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { categoriesTable } from "./categories";
import { collectionsTable } from "./collections";

export const rarityEnum = [
  "common",
  "uncommon",
  "rare",
  "holo_rare",
  "ultra_rare",
  "secret_rare",
  "promo",
] as const;

export const conditionEnum = [
  "mint",
  "near_mint",
  "excellent",
  "good",
  "light_played",
  "played",
  "poor",
] as const;

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  name: text("name").notNull(),
  pokemonName: text("pokemon_name").notNull(),
  setName: text("set_name"),
  setId: text("set_id"),
  cardNumber: text("card_number"),
  rarity: text("rarity").notNull(),
  condition: text("condition").notNull(),
  imageUrl: text("image_url"),
  originalScanUrl: text("original_scan_url"),
  catalogCardId: text("catalog_card_id"),
  estimatedValue: numeric("estimated_value", { precision: 10, scale: 2 }),
  acquiredDate: timestamp("acquired_date"),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  collectionId: integer("collection_id").references(() => collectionsTable.id, {
    onDelete: "set null",
  }),
  forSale: boolean("for_sale").default(false).notNull(),
  listingPrice: numeric("listing_price", { precision: 10, scale: 2 }),
  notes: text("notes"),
  cardStory: text("card_story"),
  agentAcquiredAt: timestamp("agent_acquired_at", { withTimezone: true }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  ownerCatalogUnique: uniqueIndex("cards_owner_catalog_unique")
    .on(table.ownerClerkId, table.catalogCardId)
    .where(sql`${table.catalogCardId} is not null`),
  ownerSetNumberUnique: uniqueIndex("cards_owner_set_number_unique")
    .on(table.ownerClerkId, table.setId, table.cardNumber)
    .where(sql`${table.setId} is not null and ${table.cardNumber} is not null`),
}));

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
