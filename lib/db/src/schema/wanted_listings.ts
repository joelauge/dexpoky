import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wantedStatusEnum = ["active", "closed"] as const;

export const wantedListingsTable = pgTable("wanted_listings", {
  id: serial("id").primaryKey(),
  ownerClerkId: text("owner_clerk_id").notNull(),
  ownerDisplayName: text("owner_display_name"),
  ownerImageUrl: text("owner_image_url"),
  catalogCardId: text("catalog_card_id").notNull(),
  name: text("name").notNull(),
  pokemonName: text("pokemon_name").notNull(),
  setName: text("set_name"),
  setCode: text("set_code"),
  cardNumber: text("card_number"),
  rarity: text("rarity"),
  imageUrl: text("image_url"),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  notes: text("notes"),
  status: text("status").default("active").notNull(),
  shortCode: text("short_code").notNull().unique(),
  isPublic: boolean("is_public").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWantedListingSchema = createInsertSchema(wantedListingsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertWantedListing = z.infer<typeof insertWantedListingSchema>;
export type WantedListing = typeof wantedListingsTable.$inferSelect;
