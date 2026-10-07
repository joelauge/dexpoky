import { index, pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const binderStyleEnum = ["ring", "zip", "folio"] as const;
export type BinderStyle = (typeof binderStyleEnum)[number];

export const bindersTable = pgTable(
  "binders",
  {
    id: serial("id").primaryKey(),
    ownerClerkId: text("owner_clerk_id").notNull(),
    name: text("name").notNull(),
    style: text("style").$type<BinderStyle>().notNull(),
    coverColor: text("cover_color").notNull(),
    revision: integer("revision").default(1).notNull(),
    isPublic: boolean("is_public").default(false).notNull(),
    shareToken: text("share_token").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    ownerClerkIdIdx: index("binders_owner_clerk_id_idx").on(table.ownerClerkId),
  }),
);

export const insertBinderSchema = createInsertSchema(bindersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBinder = z.infer<typeof insertBinderSchema>;
export type Binder = typeof bindersTable.$inferSelect;