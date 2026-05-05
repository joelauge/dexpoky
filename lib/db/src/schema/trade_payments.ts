import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { tradeOffersTable } from "./trade_offers";

export const tradePaymentsTable = pgTable("trade_payments", {
  id: serial("id").primaryKey(),
  tradeOfferId: integer("trade_offer_id")
    .notNull()
    .references(() => tradeOffersTable.id, { onDelete: "cascade" }),
  payerClerkId: text("payer_clerk_id").notNull(),
  payeeClerkId: text("payee_clerk_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(0),
  status: text("status").notNull().default("pending"),
  paymentMethod: text("payment_method").notNull(),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type TradePayment = typeof tradePaymentsTable.$inferSelect;
