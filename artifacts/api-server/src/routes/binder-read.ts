import { and, eq } from "drizzle-orm";
import { db, binderPagesTable, binderSlotsTable, cardsTable, wishlistItemsTable } from "@workspace/db";

/** Signed display IDs keep wishlisted printings distinct from owned copies. */
export async function readBinderPages(binderId: number, ownerId: string) {
  const pages = await db.select({
    id: binderPagesTable.id, rows: binderPagesTable.rows, columns: binderPagesTable.columns,
    widthMm: binderPagesTable.widthMm, heightMm: binderPagesTable.heightMm,
  }).from(binderPagesTable).where(eq(binderPagesTable.binderId, binderId)).orderBy(binderPagesTable.position);
  const slots = await db.select({
    pageId: binderSlotsTable.pageId, slot: binderSlotsTable.slot,
    cardId: cardsTable.id, wishlistId: wishlistItemsTable.id,
  }).from(binderSlotsTable)
    .innerJoin(binderPagesTable, eq(binderPagesTable.id, binderSlotsTable.pageId))
    .leftJoin(cardsTable, and(eq(cardsTable.id, binderSlotsTable.cardId), eq(cardsTable.ownerClerkId, ownerId)))
    .leftJoin(wishlistItemsTable, and(eq(wishlistItemsTable.id, binderSlotsTable.wishlistItemId), eq(wishlistItemsTable.ownerClerkId, ownerId)))
    .where(eq(binderPagesTable.binderId, binderId));
  const byPage = new Map<string, Array<{slot: number; cardId: number}>>();
  for (const entry of slots) {
    const cardId = entry.cardId ?? (entry.wishlistId ? -entry.wishlistId : null);
    if (cardId === null) continue;
    const values = byPage.get(entry.pageId) ?? [];
    values.push({ slot: entry.slot, cardId });
    byPage.set(entry.pageId, values);
  }
  return pages.map(page => ({ ...page, slots: byPage.get(page.id) ?? [] }));
}
