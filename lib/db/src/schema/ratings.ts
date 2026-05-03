import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { listingsTable } from "./listings";

export const ratingsTable = pgTable("ratings", {
  id: serial("id").primaryKey(),
  raterClerkId: text("rater_clerk_id").notNull(),
  ratedClerkId: text("rated_clerk_id").notNull(),
  listingId: integer("listing_id")
    .notNull()
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  comment: text("comment"),
  type: text("type").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Rating = typeof ratingsTable.$inferSelect;
