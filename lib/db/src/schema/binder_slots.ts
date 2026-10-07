import { pgTable, text, integer, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { binderPagesTable } from "./binder_pages";
import { cardsTable } from "./cards";
import { wishlistItemsTable } from "./wishlist";

export const binderSlotsTable = pgTable(
  "binder_slots",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => binderPagesTable.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    cardId: integer("card_id")
      .references(() => cardsTable.id, { onDelete: "cascade" }),
    wishlistItemId: integer("wishlist_item_id")
      .references(() => wishlistItemsTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    cardIdIdx: index("binder_slots_card_id_idx").on(table.cardId),
    wishlistItemIdIdx: index("binder_slots_wishlist_item_id_idx").on(table.wishlistItemId),
    contentCheck: check("binder_slots_one_content", sql`num_nonnulls(${table.cardId}, ${table.wishlistItemId}) = 1`),
    pageSlotUnique: uniqueIndex("binder_slots_page_slot_unique").on(
      table.pageId,
      table.slot,
    ),
  }),
);

export const insertBinderSlotSchema = createInsertSchema(binderSlotsTable);
export type InsertBinderSlot = z.infer<typeof insertBinderSlotSchema>;
export type BinderSlot = typeof binderSlotsTable.$inferSelect;