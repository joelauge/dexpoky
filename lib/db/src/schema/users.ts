import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email"),
  username: text("username"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  sellerDetails: text("seller_details"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  freeTrialActivated: boolean("free_trial_activated").default(false).notNull(),
  freeTrialScansUsed: integer("free_trial_scans_used").default(0).notNull(),
  payoutMethod: text("payout_method"),
  payoutDestination: text("payout_destination"),
  usernameChangedAt: timestamp("username_changed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
