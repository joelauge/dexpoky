import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const sellerPayoutsTable = pgTable("seller_payouts", {
  id: serial("id").primaryKey(),
  sellerClerkId: text("seller_clerk_id").notNull(),
  kind: text("kind").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull().default("completed"),
  listingId: integer("listing_id"),
  stripeSessionId: text("stripe_session_id"),
  payoutMethod: text("payout_method"),
  payoutDestination: text("payout_destination"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SellerPayout = typeof sellerPayoutsTable.$inferSelect;
