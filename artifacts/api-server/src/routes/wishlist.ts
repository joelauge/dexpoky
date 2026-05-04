import { Router } from "express";
import { db, wishlistItemsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { AddWishlistItemBody, UpdateWishlistItemBody } from "@workspace/api-zod";
import {
  pwGetCard,
  normalizeCatalogCard,
  enrichCatalogCardImages,
} from "../lib/pokewallet.js";

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
  categoryId: wishlistItemsTable.categoryId,
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

  // Backfill missing images via TCGdex for legacy rows saved before the
  // enrichment was wired in. Healed images are written back so subsequent
  // loads are instant.
  const missing = items.filter((it) => !it.imageUrl);
  if (missing.length > 0) {
    const enriched = await enrichCatalogCardImages(
      missing.map((it) => ({
        id: it.catalogCardId,
        name: it.name,
        pokemonName: it.pokemonName,
        setName: it.setName ?? "",
        setCode: it.setCode ?? "",
        cardNumber: it.cardNumber ?? "",
        rarity: it.rarity,
        imageUrl: "",
        marketPrice: null,
        tcgplayerUrl: null,
        cardmarketUrl: null,
      })),
    );
    const byId = new Map(missing.map((it, i) => [it.id, enriched[i]?.imageUrl]));
    await Promise.all(
      Array.from(byId.entries())
        .filter(([, url]) => !!url)
        .map(([id, url]) =>
          db
            .update(wishlistItemsTable)
            .set({ imageUrl: url as string })
            .where(eq(wishlistItemsTable.id, id)),
        ),
    );
    for (const it of items) {
      if (!it.imageUrl) {
        const url = byId.get(it.id);
        if (url) it.imageUrl = url;
      }
    }
  }

  res.json(items.reverse());
});

router.post("/wishlist", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = AddWishlistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }
  const { catalogCardId, priority, notes, categoryId } = parsed.data;

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
  const [enriched] = await enrichCatalogCardImages([
    normalizeCatalogCard(lookup.data),
  ]);
  const normalized = enriched;

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
      categoryId: categoryId ?? null,
    })
    .onConflictDoUpdate({
      target: [wishlistItemsTable.ownerClerkId, wishlistItemsTable.catalogCardId],
      set: {
        priority: priority ?? sql`${wishlistItemsTable.priority}`,
        notes: notes !== undefined ? notes : sql`${wishlistItemsTable.notes}`,
        categoryId: categoryId !== undefined ? categoryId : sql`${wishlistItemsTable.categoryId}`,
        lastSeenPrice:
          normalized.marketPrice != null ? String(normalized.marketPrice) : null,
        // Heal stored imageUrl when we now have one and the existing row doesn't.
        imageUrl: normalized.imageUrl
          ? sql`coalesce(${wishlistItemsTable.imageUrl}, ${normalized.imageUrl})`
          : sql`${wishlistItemsTable.imageUrl}`,
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
  if (parsed.data.categoryId !== undefined) update.categoryId = parsed.data.categoryId;
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
