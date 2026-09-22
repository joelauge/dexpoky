import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { tradeOffersTable } from "./trade_offers";

export const disputeReportsTable = pgTable("dispute_reports", {
  id: serial("id").primaryKey(),
  tradeOfferId: integer("trade_offer_id").notNull().references(() => tradeOffersTable.id, { onDelete: "cascade" }),
  reporterClerkId: text("reporter_clerk_id").notNull(),
  subjectClerkId: text("subject_clerk_id").notNull(),
  description: text("description").notNull(),
  evidenceProvided: jsonb("evidence_provided").$type<Record<string, boolean>>().notNull(),
  category: text("category").notNull(),
  urgency: text("urgency").notNull(),
  missingEvidence: jsonb("missing_evidence").$type<string[]>().notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }).notNull(),
  reviewState: text("review_state").notNull(),
  route: text("route").notNull(),
  escalated: boolean("escalated").notNull().default(false),
  observedFacts: jsonb("observed_facts").$type<string[]>().notNull(),
  evaluatorVersion: text("evaluator_version").notNull(),
  modelUnavailable: boolean("model_unavailable").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DisputeReport = typeof disputeReportsTable.$inferSelect;