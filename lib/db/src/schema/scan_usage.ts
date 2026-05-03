import { pgTable, serial, text, integer, unique } from "drizzle-orm/pg-core";

export const scanUsageTable = pgTable(
  "scan_usage",
  {
    id: serial("id").primaryKey(),
    clerkId: text("clerk_id").notNull(),
    period: text("period").notNull(),
    count: integer("count").default(0).notNull(),
  },
  (t) => [unique("scan_usage_clerk_period").on(t.clerkId, t.period)],
);

export type ScanUsage = typeof scanUsageTable.$inferSelect;
