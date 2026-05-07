import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { apiKeysTable } from "./api_keys";
import { listingsTable } from "./listings";

export const inviteSendsTable = pgTable("invite_sends", {
  id: serial("id").primaryKey(),
  fromClerkId: text("from_clerk_id").notNull(),
  apiKeyId: integer("api_key_id").references(() => apiKeysTable.id, { onDelete: "set null" }),
  toEmail: text("to_email"),
  toPhone: text("to_phone"),
  toName: text("to_name").notNull().default(""),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  featuredListingId: integer("featured_listing_id").references(() => listingsTable.id, { onDelete: "set null" }),
  ctaUrl: text("cta_url"),
  channel: text("channel").notNull().default("email"),
  status: text("status").notNull().default("sent"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export type InviteSend = typeof inviteSendsTable.$inferSelect;
