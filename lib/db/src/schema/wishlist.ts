import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wishlistPriorityEnum = ["low", "normal", "high"] as const;
export type WishlistPriority = (typeof wishlistPriorityEnum)[number];

export const wishlistItemsTable = pgTable(
  "wishlist_items",
  {
    id: serial("id").primaryKey(),
    ownerClerkId: text("owner_clerk_id").notNull(),
    catalogCardId: text("catalog_card_id").notNull(),
    name: text("name").notNull(),
    pokemonName: text("pokemon_name").notNull(),
    setName: text("set_name"),
    setCode: text("set_code"),
    cardNumber: text("card_number"),
    rarity: text("rarity"),
    imageUrl: text("image_url"),
    lastSeenPrice: numeric("last_seen_price", { precision: 10, scale: 2 }),
    notes: text("notes"),
    priority: text("priority").default("normal").notNull(),
    categoryId: integer("category_id"),
    addedAt: timestamp("added_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    wishlistOwnerCardUnique: uniqueIndex("wishlist_owner_catalog_unique").on(
      t.ownerClerkId,
      t.catalogCardId,
    ),
  }),
);

export const insertWishlistItemSchema = createInsertSchema(wishlistItemsTable).omit({
  id: true,
  addedAt: true,
  updatedAt: true,
});

export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
export type WishlistItem = typeof wishlistItemsTable.$inferSelect;
