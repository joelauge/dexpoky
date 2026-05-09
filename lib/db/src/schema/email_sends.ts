import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { apiKeysTable } from "./api_keys";

export const emailSendsTable = pgTable("email_sends", {
  id: serial("id").primaryKey(),
  apiKeyId: integer("api_key_id").references(() => apiKeysTable.id, { onDelete: "set null" }),
  clerkId: text("clerk_id").notNull(),
  toAddresses: text("to_addresses").array().notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"),
  resendMessageId: text("resend_message_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailSend = typeof emailSendsTable.$inferSelect;
