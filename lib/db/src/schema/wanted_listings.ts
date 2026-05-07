import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  boolean,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const wantedStatusEnum = ["active", "closed"] as const;

export const wantedListingsTable = pgTable(
  "wanted_listings",
  {
    id: serial("id").primaryKey(),
    ownerClerkId: text("owner_clerk_id").notNull(),
    // Clerk usernames never contain spaces. This column must store a username
    // (or be null). The check constraint below enforces this at the DB level so
    // that the old firstName+" "+lastName pattern cannot silently re-appear.
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
  },
  (t) => [
    // Reject display names that contain a space — Clerk usernames never have
    // spaces, so a space indicates the old firstName+" "+lastName bug.
    check("owner_display_name_no_spaces", sql`${t.ownerDisplayName} IS NULL OR ${t.ownerDisplayName} NOT LIKE '% %'`),
  ],
);

// Zod-level guard mirrors the DB check constraint so bad values are caught at
// the application boundary before they ever reach the database.
export const insertWantedListingSchema = createInsertSchema(wantedListingsTable, {
  ownerDisplayName: z.string().refine((v) => !v.includes(" "), {
    message: "ownerDisplayName must not contain spaces (store a username, not a display name)",
  }).nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export type InsertWantedListing = z.infer<typeof insertWantedListingSchema>;
export type WantedListing = typeof wantedListingsTable.$inferSelect;
