import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const shortLinksTable = pgTable("short_links", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  targetUrl: text("target_url").notNull(),
  clerkId: text("clerk_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ShortLink = typeof shortLinksTable.$inferSelect;
