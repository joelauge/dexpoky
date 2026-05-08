import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  numeric,
  integer,
} from "drizzle-orm/pg-core";

export const agentTriggerEnum = ["buy_now", "bid"] as const;
export const agentStatusEnum = ["active", "paused", "budget_exhausted"] as const;

export const dexAgentsTable = pgTable("dex_agents", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull(),
  name: text("name").notNull(),
  pokemonName: text("pokemon_name").notNull(),
  triggerType: text("trigger_type").notNull().default("buy_now"),
  maxPricePathUsd: numeric("max_price_path_usd", { precision: 10, scale: 6 }).notNull(),
  budgetPathUsd: numeric("budget_path_usd", { precision: 10, scale: 6 }).notNull(),
  spentPathUsd: numeric("spent_path_usd", { precision: 10, scale: 6 }).notNull().default("0"),
  requireHoloOnly: boolean("require_holo_only").notNull().default(false),
  requireCondition: text("require_condition"),
  status: text("status").notNull().default("active"),
  runsCount: integer("runs_count").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DexAgent = typeof dexAgentsTable.$inferSelect;

export const agentRunsTable = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  agentId: integer("agent_id")
    .notNull()
    .references(() => dexAgentsTable.id, { onDelete: "cascade" }),
  clerkId: text("clerk_id").notNull(),
  listingId: integer("listing_id"),
  cardName: text("card_name"),
  amountPathUsd: numeric("amount_path_usd", { precision: 10, scale: 6 }),
  tempoTxHash: text("tempo_tx_hash"),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AgentRun = typeof agentRunsTable.$inferSelect;
