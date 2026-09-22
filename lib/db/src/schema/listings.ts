import {
  pgTable,
  serial,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cardsTable } from "./cards";

export const listingStatusEnum = ["active", "sold", "cancelled"] as const;
export const listingTypeEnum = ["buy_now", "auction"] as const;

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id")
    .notNull()
    .references(() => cardsTable.id, { onDelete: "cascade" }),
  sellerClerkId: text("seller_clerk_id"),
  listingType: text("listing_type").default("buy_now").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  buyNowPrice: numeric("buy_now_price", { precision: 10, scale: 2 }),
  reservePrice: numeric("reserve_price", { precision: 10, scale: 2 }),
  startingBid: numeric("starting_bid", { precision: 10, scale: 2 }),
  currentBid: numeric("current_bid", { precision: 10, scale: 2 }),
  currentBidderClerkId: text("current_bidder_clerk_id"),
  minBidIncrement: numeric("min_bid_increment", { precision: 10, scale: 2 }).default("1.00"),
  auctionEndTime: timestamp("auction_end_time"),
  status: text("status").default("active").notNull(),
  description: text("description"),
  listingImages: text("listing_images").array(),
  listingVideo: text("listing_video"),
  qualityReview: jsonb("quality_review"),
  qualityReviewEvidenceHash: text("quality_review_evidence_hash"),
  qualityReviewedAt: timestamp("quality_reviewed_at"),
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  viewCount: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
