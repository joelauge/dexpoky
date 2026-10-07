import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { wantedListingsTable } from "./wanted_listings";
import { listingsTable } from "./listings";
import { bindersTable } from "./binders";
import { wishlistItemsTable } from "./wishlist";
import { cardsTable } from "./cards";

export const dmThreadsTable = pgTable("dm_threads", {
  id: serial("id").primaryKey(),
  wantedListingId: integer("wanted_listing_id")
    .references(() => wantedListingsTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id")
    .references(() => listingsTable.id, { onDelete: "cascade" }),
  buyerClerkId: text("buyer_clerk_id").notNull(),
  sellerClerkId: text("seller_clerk_id").notNull(),
  binderId: integer("binder_id").references(() => bindersTable.id, { onDelete: "set null" }),
  binderWishlistItemId: integer("binder_wishlist_item_id").references(() => wishlistItemsTable.id, { onDelete: "set null" }),
  binderCardId: integer("binder_card_id").references(() => cardsTable.id, { onDelete: "set null" }),
  binderSellerCardId: integer("binder_seller_card_id").references(() => cardsTable.id, { onDelete: "set null" }),
  binderCardName: text("binder_card_name"),
  binderCardImageUrl: text("binder_card_image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  binderContactUnique: uniqueIndex("dm_threads_binder_contact_unique").on(t.binderId, t.binderWishlistItemId, t.sellerClerkId),
  binderCardContactUnique: uniqueIndex("dm_threads_binder_card_contact_unique").on(t.binderId, t.binderCardId, t.buyerClerkId),
}));

export type DmThread = typeof dmThreadsTable.$inferSelect;
