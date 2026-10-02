import { pgTable, text, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { binderPagesTable } from "./binder_pages";
import { cardsTable } from "./cards";

export const binderSlotsTable = pgTable(
  "binder_slots",
  {
    pageId: text("page_id")
      .notNull()
      .references(() => binderPagesTable.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cardsTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    cardIdIdx: index("binder_slots_card_id_idx").on(table.cardId),
    pageSlotUnique: uniqueIndex("binder_slots_page_slot_unique").on(
      table.pageId,
      table.slot,
    ),
  }),
);

export const insertBinderSlotSchema = createInsertSchema(binderSlotsTable);
export type InsertBinderSlot = z.infer<typeof insertBinderSlotSchema>;
export type BinderSlot = typeof binderSlotsTable.$inferSelect;