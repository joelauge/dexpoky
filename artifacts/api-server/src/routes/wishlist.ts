import { Router } from "express";
import { db, wishlistItemsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { AddWishlistItemBody, UpdateWishlistItemBody } from "@workspace/api-zod";
import { pwGetCard, normalizeCatalogCard } from "../lib/pokewallet.js";

const router = Router();

const wishlistSelect = {
  id: wishlistItemsTable.id,
  catalogCardId: wishlistItemsTable.catalogCardId,
  name: wishlistItemsTable.name,
  pokemonName: wishlistItemsTable.pokemonName,
  setName: wishlistItemsTable.setName,
  setCode: wishlistItemsTable.setCode,
  cardNumber: wishlistItemsTable.cardNumber,
  rarity: wishlistItemsTable.rarity,
  imageUrl: wishlistItemsTable.imageUrl,
  lastSeenPrice: sql<number | null>`${wishlistItemsTable.lastSeenPrice}::float`,
  notes: wishlistItemsTable.notes,
  priority: wishlistItemsTable.priority,
  addedAt: wishlistItemsTable.addedAt,
  updatedAt: wishlistItemsTable.updatedAt,
};

router.get("/wishlist", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const items = await db
    .select(wishlistSelect)
    .from(wishlistItemsTable)
    .where(eq(wishlistItemsTable.ownerClerkId, userId))
    .orderBy(wishlistItemsTable.addedAt);
  res.json(items.reverse());
});

router.post("/wishlist", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = AddWishlistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { catalogCardId, priority, notes } = parsed.data;

  const lookup = await pwGetCard(catalogCardId);
  if (!lookup.ok) {
    res.status(lookup.reason === "NOT_FOUND" ? 404 : 503).json({
      error:
        lookup.reason === "NOT_FOUND"
          ? "Catalog card not found"
          : "Catalog temporarily unavailable",
    });
    return;
  }
  const normalized = normalizeCatalogCard(lookup.data);

  const [inserted] = await db
    .insert(wishlistItemsTable)
    .values({
      ownerClerkId: userId,
      catalogCardId: normalized.id,
      name: normalized.name,
      pokemonName: normalized.pokemonName,
      setName: normalized.setName || null,
      setCode: normalized.setCode || null,
      cardNumber: normalized.cardNumber || null,
      rarity: normalized.rarity,
      imageUrl: normalized.imageUrl || null,
      lastSeenPrice:
        normalized.marketPrice != null ? String(normalized.marketPrice) : null,
      notes: notes ?? null,
      priority: priority ?? "normal",
    })
    .onConflictDoUpdate({
      target: [wishlistItemsTable.ownerClerkId, wishlistItemsTable.catalogCardId],
      set: {
        priority: priority ?? sql`${wishlistItemsTable.priority}`,
        notes: notes !== undefined ? notes : sql`${wishlistItemsTable.notes}`,
        lastSeenPrice:
          normalized.marketPrice != null ? String(normalized.marketPrice) : null,
        updatedAt: new Date(),
      },
    })
    .returning();

  const [out] = await db
    .select(wishlistSelect)
    .from(wishlistItemsTable)
    .where(eq(wishlistItemsTable.id, inserted.id));
  res.status(201).json(out);
});

router.put("/wishlist/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  const parsed = UpdateWishlistItemBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: wishlistItemsTable.ownerClerkId })
    .from(wishlistItemsTable)
    .where(eq(wishlistItemsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.priority !== undefined) update.priority = parsed.data.priority;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  await db
    .update(wishlistItemsTable)
    .set(update)
    .where(eq(wishlistItemsTable.id, id));
  const [out] = await db
    .select(wishlistSelect)
    .from(wishlistItemsTable)
    .where(eq(wishlistItemsTable.id, id));
  res.json(out);
});

router.delete("/wishlist/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: wishlistItemsTable.ownerClerkId })
    .from(wishlistItemsTable)
    .where(eq(wishlistItemsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .delete(wishlistItemsTable)
    .where(
      and(
        eq(wishlistItemsTable.id, id),
        eq(wishlistItemsTable.ownerClerkId, userId),
      ),
    );
  res.status(204).send();
});

export default router;
