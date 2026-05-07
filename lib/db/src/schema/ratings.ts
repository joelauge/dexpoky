import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";
import { tradeOffersTable } from "./trade_offers";

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  raterClerkId: text("rater_clerk_id").notNull(),
  ratedClerkId: text("rated_clerk_id").notNull(),
  listingId: integer("listing_id")
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  tradeOfferId: integer("trade_offer_id")
    .references(() => tradeOffersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  comment: text("comment"),
  type: text("type").notNull(),
  subCondition: integer("sub_condition"),
  subCommunication: integer("sub_communication"),
  subShipping: integer("sub_shipping"),
  subValue: integer("sub_value"),
  transactionCompletedAt: timestamp("transaction_completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Rating = typeof ratingsTable.$inferSelect;
