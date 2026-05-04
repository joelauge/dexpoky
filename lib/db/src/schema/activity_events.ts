import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const activityEventTypeEnum = [
  "card_added",
  "card_updated",
  "card_scanned",
  "listing_created",
  "listing_sold",
  "listing_cancelled",
  "bid_placed",
  "wanted_listing_match",
] as const;

export type ActivityEventType = (typeof activityEventTypeEnum)[number];

export const activityEventsTable = pgTable("activity_events", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  clerkId: text("clerk_id"),
  cardId: integer("card_id"),
  listingId: integer("listing_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityEvent = typeof activityEventsTable.$inferSelect;
