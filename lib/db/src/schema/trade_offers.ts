import { integer, json, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { dmThreadsTable } from "./dm_threads";

export interface OfferedCard {
  cardId: number;
  cardName: string;
  imageUrl: string | null;
  estimatedValue: number | null;
  rarity: string | null;
  condition: string | null;
}

export interface OfferHistoryEntry {
  amount: number;
  cards?: OfferedCard[];
  from: "buyer" | "seller";
  sentAt: string;
  note?: string;
}

export const tradeOffersTable = pgTable("trade_offers", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .notNull()
    .unique()
    .references(() => dmThreadsTable.id, { onDelete: "cascade" }),
  sellerClerkId: text("seller_clerk_id").notNull(),
  sellerImages: text("seller_images").array(),
  sellerVideo: text("seller_video"),
  askingPrice: numeric("asking_price", { precision: 10, scale: 2 }),
  offerAmount: numeric("offer_amount", { precision: 10, scale: 2 }),
  offerHistory: json("offer_history").$type<OfferHistoryEntry[]>(),
  status: text("status").default("pending").notNull(),
  exchangeMethod: text("exchange_method"),
  videoCallScheduledAt: timestamp("video_call_scheduled_at", { withTimezone: true }),
  videoCallNotes: text("video_call_notes"),
  meetupLocation: text("meetup_location"),
  meetupProposedAt: timestamp("meetup_proposed_at", { withTimezone: true }),
  meetupNotes: text("meetup_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TradeOffer = typeof tradeOffersTable.$inferSelect;
