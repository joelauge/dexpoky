import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { dmThreadsTable } from "./dm_threads";

export const dmMessagesTable = pgTable("dm_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id")
    .notNull()
    .references(() => dmThreadsTable.id, { onDelete: "cascade" }),
  senderClerkId: text("sender_clerk_id").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DmMessage = typeof dmMessagesTable.$inferSelect;
