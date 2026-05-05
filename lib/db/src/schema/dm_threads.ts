import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { wantedListingsTable } from "./wanted_listings";
import { listingsTable } from "./listings";

export const dmThreadsTable = pgTable("dm_threads", {
  id: serial("id").primaryKey(),
  wantedListingId: integer("wanted_listing_id")
    .references(() => wantedListingsTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id")
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  buyerClerkId: text("buyer_clerk_id").notNull(),
  sellerClerkId: text("seller_clerk_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DmThread = typeof dmThreadsTable.$inferSelect;
