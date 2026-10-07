import { Router } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, inArray } from "drizzle-orm";
import { db, bindersTable, cardsTable, wishlistItemsTable, usersTable } from "@workspace/db";
import { ContactBinderWishlistBody } from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { readBinderPages } from "./binder-read.js";
import { createBinderOffer } from "./binder-offers.js";

const router = Router();
const publicWhere = (token: string) => and(eq(bindersTable.shareToken, token), eq(bindersTable.isPublic, true));

router.get("/public/binders/:token", async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const [binder] = await db.select().from(bindersTable).where(publicWhere(String(req.params.token)));
  if (!binder) { res.status(404).json({ error: "This binder is private or unavailable" }); return; }
  const pages = await readBinderPages(binder.id, binder.ownerClerkId);
  const ids = [...new Set(pages.flatMap(p => p.slots.map(s => s.cardId)))];
  const ownedIds = ids.filter(id => id > 0), wishIds = ids.filter(id => id < 0).map(id => -id);
  // Deliberately expose artwork only, never collection notes, costs or wishlist notes.
  const cards = ownedIds.length ? await db.select({
    id: cardsTable.id, name: cardsTable.name, imageUrl: cardsTable.imageUrl,
    media: cardsTable.media, catalogCardId: cardsTable.catalogCardId, setId: cardsTable.setId,
    setName: cardsTable.setName, cardNumber: cardsTable.cardNumber, condition: cardsTable.condition,
  }).from(cardsTable).where(and(eq(cardsTable.ownerClerkId, binder.ownerClerkId), inArray(cardsTable.id, ownedIds))) : [];
  const wishes = wishIds.length ? await db.select({
    id: wishlistItemsTable.id, name: wishlistItemsTable.name, imageUrl: wishlistItemsTable.imageUrl,
    catalogCardId: wishlistItemsTable.catalogCardId, setId: wishlistItemsTable.setCode,
    setName: wishlistItemsTable.setName, cardNumber: wishlistItemsTable.cardNumber,
  }).from(wishlistItemsTable).where(and(eq(wishlistItemsTable.ownerClerkId, binder.ownerClerkId), inArray(wishlistItemsTable.id, wishIds))) : [];
  const [owner] = await db.select({ username: usersTable.username }).from(usersTable)
    .where(eq(usersTable.clerkId, binder.ownerClerkId));
  res.json({
    binder: { id: binder.id, name: binder.name, style: binder.style, coverColor: binder.coverColor,
      revision: binder.revision, isPublic: true, pages, createdAt: binder.createdAt, updatedAt: binder.updatedAt },
    cards: [...cards, ...wishes.map(w => ({ ...w, id: -w.id, media: [], condition: null }))],
    isOwner: getAuth(req).userId === binder.ownerClerkId, ownerName: owner?.username || "Collector",
  });
});

router.post("/public/binders/:token/slots/:pageId/:slot/thread", requireAuth, async (req, res) => {
  const body = ContactBinderWishlistBody.safeParse(req.body);
  const slot = Number(req.params.slot);
  if (!body.success || !body.data.message.trim() || !Number.isSafeInteger(slot) || slot < 0) {
    res.status(400).json({ error: "Choose an offer type and enter a message" }); return;
  }
  const sender = (req as AuthRequest).userId;
  const result = await createBinderOffer({
    token: String(req.params.token), pageId: String(req.params.pageId), slot, sender, body: body.data,
  });
  if (result.status !== 200) { res.status(result.status).json({ error: result.error }); return; }
  res.json({ threadId: result.threadId });
});

export default router;
