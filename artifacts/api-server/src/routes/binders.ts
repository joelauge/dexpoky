import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import {
  binderPagesTable,
  binderSlotsTable,
  bindersTable,
  cardsTable,
  wishlistItemsTable,
  db,
} from "@workspace/db";
import {
  CreateBinderBody,
  DeleteBinderParams,
  GetBinderParams,
  UpdateBinderBody,
  UpdateBinderParams,
} from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  validateCreateBinder,
  validateOwnedCardIds,
  validateUpdateBinder,
} from "./binders-validation.js";

import { readBinderPages } from "./binder-read.js";
import publicBindersRouter from "./public-binders.js";
const router = Router();
router.use(publicBindersRouter);

function parseBinderId(params: unknown): number | null {
  const parsed = GetBinderParams.safeParse(params);
  return parsed.success && Number.isInteger(parsed.data.id) ? parsed.data.id : null;
}

router.get("/binders", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const rows = await db.select({
    id: bindersTable.id,
    name: bindersTable.name,
    style: bindersTable.style,
    coverColor: bindersTable.coverColor,
    revision: bindersTable.revision,
    isPublic: bindersTable.isPublic,
    pageCount: sql<number>`count(distinct ${binderPagesTable.id})::int`,
    cardCount: sql<number>`count(${cardsTable.id})::int`,
    createdAt: bindersTable.createdAt,
    updatedAt: bindersTable.updatedAt,
  })
    .from(bindersTable)
    .leftJoin(binderPagesTable, eq(binderPagesTable.binderId, bindersTable.id))
    .leftJoin(binderSlotsTable, eq(binderSlotsTable.pageId, binderPagesTable.id))
    .leftJoin(cardsTable, and(
      eq(cardsTable.id, binderSlotsTable.cardId),
      eq(cardsTable.ownerClerkId, userId),
    ))
    .where(eq(bindersTable.ownerClerkId, userId))
    .groupBy(bindersTable.id)
    .orderBy(bindersTable.name);
  res.json(rows);
});

router.post("/binders", requireAuth, async (req, res): Promise<void> => {
  // Keep generated contract validation and add strict integer/name checks.
  if (!CreateBinderBody.safeParse(req.body).success) {
    res.status(400).json({ error: "Invalid binder details" });
    return;
  }
  const parsed = validateCreateBinder(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const pageIds = Array.from({ length: parsed.data.pageCount }, () => randomUUID());
  const created = await db.transaction(async (tx) => {
    const [binder] = await tx.insert(bindersTable).values({
      ownerClerkId: userId,
      name: parsed.data.name,
      style: parsed.data.style,
      coverColor: parsed.data.coverColor,
    }).returning();
    await tx.insert(binderPagesTable).values(pageIds.map((id, position) => ({
      id,
      binderId: binder.id,
      position,
      rows: parsed.data.rows,
      columns: parsed.data.columns,
      widthMm: parsed.data.widthMm,
      heightMm: parsed.data.heightMm,
    })));
    return binder;
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    style: created.style,
    coverColor: created.coverColor,
    revision: created.revision,
    isPublic: created.isPublic,
    shareToken: created.shareToken,
    pages: pageIds.map((id) => ({
      id,
      rows: parsed.data.rows,
      columns: parsed.data.columns,
      widthMm: parsed.data.widthMm,
      heightMm: parsed.data.heightMm,
      slots: [],
    })),
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  });
});

router.get("/binders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseBinderId({ id: req.params.id });
  if (id === null) { res.status(400).json({ error: "Invalid binder id" }); return; }
  const userId = (req as AuthRequest).userId;
  const [binder] = await db.select().from(bindersTable)
    .where(and(eq(bindersTable.id, id), eq(bindersTable.ownerClerkId, userId)));
  if (!binder) { res.status(404).json({ error: "Binder not found" }); return; }
  const pages = await readBinderPages(binder.id, userId);
  res.json({
    id: binder.id,
    name: binder.name,
    style: binder.style,
    coverColor: binder.coverColor,
    revision: binder.revision,
    isPublic: binder.isPublic,
    shareToken: binder.shareToken,
    pages,
    createdAt: binder.createdAt,
    updatedAt: binder.updatedAt,
  });
});

router.put("/binders/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseBinderId({ id: req.params.id });
  if (id === null) { res.status(400).json({ error: "Invalid binder id" }); return; }
  if (!UpdateBinderBody.safeParse(req.body).success) {
    res.status(400).json({ error: "Invalid binder layout" });
    return;
  }
  const parsed = validateUpdateBinder(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const result = await db.transaction(async (tx) => {
    const [binder] = await tx.select().from(bindersTable)
      .where(and(eq(bindersTable.id, id), eq(bindersTable.ownerClerkId, userId)))
      .for("update");
    if (!binder) return { kind: "missing" as const };
    if (binder.revision !== parsed.data.revision) return { kind: "conflict" as const };

    const pageIds = parsed.data.pages.map((page) => page.id);
    const existingIds = await tx.select({ id: binderPagesTable.id, binderId: binderPagesTable.binderId })
      .from(binderPagesTable)
      .where(inArray(binderPagesTable.id, pageIds));
    if (existingIds.some((page) => page.binderId !== binder.id)) {
      return { kind: "invalid" as const, error: "Page ID already belongs to another binder" };
    }

    const allIds = [...new Set(parsed.data.pages.flatMap((page) => page.slots.map((slot) => slot.cardId)))];
    const cardIds = allIds.filter(id => id > 0);
    const wishlistIds = allIds.filter(id => id < 0).map(id => -id);
    if (cardIds.length) {
      const ownedCards = await tx.select({ id: cardsTable.id }).from(cardsTable)
        .where(and(eq(cardsTable.ownerClerkId, userId), inArray(cardsTable.id, cardIds)))
        .for("share");
      const ownershipError = validateOwnedCardIds(cardIds, ownedCards.map((card) => card.id));
      if (ownershipError) return { kind: "invalid" as const, error: ownershipError };
    }
    if (wishlistIds.length) {
      const ownedWishlist = await tx.select({ id: wishlistItemsTable.id }).from(wishlistItemsTable)
        .where(and(eq(wishlistItemsTable.ownerClerkId, userId), inArray(wishlistItemsTable.id, wishlistIds)))
        .for("share");
      if (ownedWishlist.length !== wishlistIds.length) return { kind: "invalid" as const, error: "One or more wishlist cards are not on your wishlist" };
    }

    await tx.delete(binderPagesTable).where(eq(binderPagesTable.binderId, binder.id));
    await tx.insert(binderPagesTable).values(parsed.data.pages.map((page, position) => ({
      id: page.id,
      binderId: binder.id,
      position,
      rows: page.rows,
      columns: page.columns,
      widthMm: page.widthMm,
      heightMm: page.heightMm,
    })));
    const slotRows = parsed.data.pages.flatMap((page) => page.slots.map((slot) => ({
      pageId: page.id,
      slot: slot.slot,
      cardId: slot.cardId > 0 ? slot.cardId : null,
      wishlistItemId: slot.cardId < 0 ? -slot.cardId : null,
    })));
    if (slotRows.length) await tx.insert(binderSlotsTable).values(slotRows);
    const now = new Date();
    const [updated] = await tx.update(bindersTable).set({
      name: parsed.data.name,
      style: parsed.data.style,
      coverColor: parsed.data.coverColor,
      isPublic: parsed.data.isPublic ?? binder.isPublic,
      shareToken: (parsed.data.isPublic ?? binder.isPublic) ? binder.shareToken ?? randomUUID() : binder.shareToken,
      revision: binder.revision + 1,
      updatedAt: now,
    }).where(and(
      eq(bindersTable.id, binder.id),
      eq(bindersTable.ownerClerkId, userId),
    )).returning();
    return { kind: "updated" as const, binder: updated };
  });
  if (result.kind === "missing") { res.status(404).json({ error: "Binder not found" }); return; }
  if (result.kind === "conflict") { res.status(409).json({ error: "Binder revision conflict; reload before saving" }); return; }
  if (result.kind === "invalid") { res.status(400).json({ error: result.error }); return; }
  res.json({
    id: result.binder.id,
    name: result.binder.name,
    style: result.binder.style,
    coverColor: result.binder.coverColor,
    revision: result.binder.revision,
    isPublic: result.binder.isPublic,
    shareToken: result.binder.shareToken,
    pages: parsed.data.pages,
    createdAt: result.binder.createdAt,
    updatedAt: result.binder.updatedAt,
  });
});

router.delete("/binders/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteBinderParams.safeParse({ id: req.params.id });
  if (!parsed.success || !Number.isInteger(parsed.data.id)) {
    res.status(400).json({ error: "Invalid binder id" });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const deleted = await db.delete(bindersTable).where(and(
    eq(bindersTable.id, parsed.data.id),
    eq(bindersTable.ownerClerkId, userId),
  )).returning({ id: bindersTable.id });
  if (!deleted.length) { res.status(404).json({ error: "Binder not found" }); return; }
  res.status(204).send();
});

export default router;