import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { dexAgentsTable } from "./dex_agents";

export const agentApprovalRequestsTable = pgTable("agent_approval_requests", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => dexAgentsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  listingId: integer("listing_id"),
  cardName: text("card_name"),
  pricePathUsd: numeric("price_path_usd", { precision: 10, scale: 6 }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentApprovalRequest = typeof agentApprovalRequestsTable.$inferSelect;
