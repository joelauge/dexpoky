import { pgTable, serial, text, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { dexAgentsTable } from "./dex_agents";

export const agentExternalFindsTable = pgTable("agent_external_finds", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => dexAgentsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  cardName: text("card_name").notNull(),
  site: text("site").notNull().default("eBay"),
  listingTitle: text("listing_title"),
  listingUrl: text("listing_url").notNull(),
  priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentExternalFind = typeof agentExternalFindsTable.$inferSelect;
