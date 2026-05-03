import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

export const auctionBidsTable = pgTable("auction_bids", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  bidderClerkId: text("bidder_clerk_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  maxAmount: numeric("max_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuctionBid = typeof auctionBidsTable.$inferSelect;
