import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const tempoWalletsTable = pgTable("tempo_wallets", {
  id: serial("id").primaryKey(),
  clerkId: text("clerk_id").notNull().unique(),
  address: text("address").notNull().unique(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type TempoWallet = typeof tempoWalletsTable.$inferSelect;
