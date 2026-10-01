import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { cardsTable } from "./cards";

export const gradingCompanyEnum = ["psa", "bgs", "cgc", "tag"] as const;
export const gradingStatusEnum = ["pending", "verified", "rejected"] as const;

export const cardGradingCertsTable = pgTable("card_grading_certs", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id").notNull().references(() => cardsTable.id, { onDelete: "cascade" }),
  ownerClerkId: text("owner_clerk_id").notNull(),
  gradingCompany: text("grading_company").notNull(),
  certNumber: text("cert_number").notNull(),
  grade: text("grade"),
  gradeDescription: text("grade_description"),
  gradedSubject: text("graded_subject"),
  gradedYear: text("graded_year"),
  gradedSet: text("graded_set"),
  gradedCardNumber: text("graded_card_number"),
  populationSame: integer("population_same"),
  populationHigher: integer("population_higher"),
  certData: jsonb("cert_data"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type CardGradingCert = typeof cardGradingCertsTable.$inferSelect;
