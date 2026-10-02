import { pgTable, text, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bindersTable } from "./binders";

export const binderPagesTable = pgTable(
  "binder_pages",
  {
    id: text("id").primaryKey(),
    binderId: integer("binder_id")
      .notNull()
      .references(() => bindersTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    rows: integer("rows").notNull(),
    columns: integer("columns").notNull(),
    widthMm: integer("width_mm").notNull(),
    heightMm: integer("height_mm").notNull(),
  },
  (table) => ({
    binderPositionUnique: uniqueIndex("binder_pages_binder_position_unique").on(
      table.binderId,
      table.position,
    ),
  }),
);

export const insertBinderPageSchema = createInsertSchema(binderPagesTable);
export type InsertBinderPage = z.infer<typeof insertBinderPageSchema>;
export type BinderPage = typeof binderPagesTable.$inferSelect;