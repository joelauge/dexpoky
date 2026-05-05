import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, activityEventsTable } from "@workspace/db";
import { searchTcgdex, fetchPricingById } from "./detect-helpers.js";
import {
  pwSearch,
  pwGetCard,
  normalizeCatalogCard,
  buildPricingFromCatalog,
  enrichCatalogCardImages,
} from "../lib/pokewallet.js";
import { eq, sql, ilike, and, type SQL } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  ListCardsQueryParams,
  CreateCardBody,
  UpdateCardBody,
  GetCardParams,
  UpdateCardParams,
  DeleteCardParams,
} from "@workspace/api-zod";

const router = Router();

const cardSelect = {
  id: cardsTable.id,
  name: cardsTable.name,
  pokemonName: cardsTable.pokemonName,
  setName: cardsTable.setName,
  cardNumber: cardsTable.cardNumber,
  rarity: cardsTable.rarity,
  condition: cardsTable.condition,
  imageUrl: cardsTable.imageUrl,
  originalScanUrl: cardsTable.originalScanUrl,
  catalogCardId: cardsTable.catalogCardId,
  estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
  acquiredDate: cardsTable.acquiredDate,
  categoryId: cardsTable.categoryId,
  categoryName: categoriesTable.name,
  forSale: cardsTable.forSale,
  listingPrice: sql<number | null>`${cardsTable.listingPrice}::float`,
  notes: cardsTable.notes,
  cardStory: cardsTable.cardStory,
  ownerClerkId: cardsTable.ownerClerkId,
  createdAt: cardsTable.createdAt,
  updatedAt: cardsTable.updatedAt,
};

router.get("/cards", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = ListCardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { categoryId, forSale, search, rarity } = parsed.data;
  const conditions: SQL[] = [eq(cardsTable.ownerClerkId, userId)];
  if (categoryId !== undefined) conditions.push(eq(cardsTable.categoryId, categoryId));
  if (forSale !== undefined) conditions.push(eq(cardsTable.forSale, forSale));
  if (search) conditions.push(ilike(cardsTable.name, `%${search}%`));
  if (rarity) conditions.push(eq(cardsTable.rarity, rarity));

  const cards = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(and(...conditions))
    .orderBy(cardsTable.createdAt);

  res.json(cards);
});

router.post("/cards", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }
  const data = parsed.data;
  const source = (req.body.source as string | undefined) ?? "manual";

  if (data.categoryId != null) {
    const [cat] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(and(eq(categoriesTable.id, data.categoryId), eq(categoriesTable.ownerClerkId, userId)));
    if (!cat) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }
  }

  const [card] = await db.insert(cardsTable).values({
    ownerClerkId: userId,
    name: data.name,
    pokemonName: data.pokemonName,
    rarity: data.rarity,
    condition: data.condition,
    forSale: data.forSale,
    setName: data.setName ?? null,
    cardNumber: data.cardNumber ?? null,
    imageUrl: data.imageUrl ?? null,
    originalScanUrl: data.originalScanUrl ?? null,
    catalogCardId: data.catalogCardId ?? null,
    estimatedValue: data.estimatedValue != null ? String(data.estimatedValue) : null,
    acquiredDate: data.acquiredDate ?? null,
    categoryId: data.categoryId ?? null,
    listingPrice: data.listingPrice != null ? String(data.listingPrice) : null,
    notes: data.notes ?? null,
    cardStory: data.cardStory ?? null,
  }).returning();

  const [withCat] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, card.id));

  await db.insert(activityEventsTable).values({
    type: source === "scan" ? "card_scanned" : "card_added",
    clerkId: userId,
    cardId: card.id,
    metadata: {
      name: card.name,
      pokemonName: card.pokemonName,
      imageUrl: card.imageUrl,
      estimatedValue: card.estimatedValue,
      setName: card.setName,
    },
  });

  res.status(201).json(withCat);
});

/**
 * Look up card variants for the scan flow.
 *
 * Primary: PokeWallet (rich pricing, single hit). Falls back to TCGdex if
 * PokeWallet is rate limited or unavailable so the scan flow never breaks.
 */
/**
 * Parse a raw card number string into a plain integer for exact-printing matching.
 * "002", "002/094", "138/193" → leading integer. Returns NaN on failure.
 */
function parseCardNumLocal(raw: string | null | undefined): number {
  if (!raw) return NaN;
  const m = String(raw).match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

router.get("/cards/lookup", async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  // Optional hint fields extracted from the card image by the vision model.
  // When provided they are used to float the exact printing to position [0].
  const cardNumber = String(req.query.cardNumber ?? "").trim() || undefined;
  const targetNum = cardNumber ? parseCardNumLocal(cardNumber) : NaN;

  const pw = await pwSearch(name, 100);
  if (pw.ok && pw.data.results.length > 0) {
    const normalized = pw.data.results.map(normalizeCatalogCard);
    const enriched = await enrichCatalogCardImages(normalized);
    let variants = enriched.map((v) => ({
      id: v.id,
      name: v.name,
      imageUrl: v.imageUrl,
      setName: v.setName,
      setId: v.setCode,
      cardNumber: v.cardNumber,
      rarity: v.rarity,
    }));

    // Float the exact-number match to the top when a card number hint is available
    if (!isNaN(targetNum)) {
      variants = variants.sort((a, b) => {
        const aMatch = parseCardNumLocal(a.cardNumber) === targetNum ? 0 : 1;
        const bMatch = parseCardNumLocal(b.cardNumber) === targetNum ? 0 : 1;
        return aMatch - bMatch;
      });
    }

    // Price from the variant that's actually on top, not always results[0].
    // After sorting, variants[0] may differ from the first PokeWallet result.
    const topId = variants[0]?.id;
    const topRaw =
      (topId ? pw.data.results.find((r) => r.id === topId) : null) ??
      pw.data.results[0];
    const pricing = buildPricingFromCatalog(topRaw);
    res.json({ card: variants[0] ?? null, variants, pricing });
    return;
  }

  // Fallback to TCGdex — pass cardNumber so it can sort the results too
  const { variants, pricing } = await searchTcgdex(name, cardNumber);
  res.json({ card: variants[0] ?? null, variants, pricing });
});

/**
 * Pricing for a single chosen variant.
 *
 * If `cardId` looks like a PokeWallet id (starts with `pk_`), we hit the
 * PokeWallet detail endpoint. Otherwise we fall through to the TCGdex/PTCG.io
 * pricing chain.
 */
router.get("/cards/pricing", async (req, res) => {
  const cardId = String(req.query.cardId ?? "").trim();
  const name = String(req.query.name ?? "").trim() || undefined;
  const rarity = String(req.query.rarity ?? "").trim() || undefined;
  const setName = String(req.query.setName ?? "").trim() || undefined;
  const cardNumber = String(req.query.cardNumber ?? "").trim() || undefined;
  if (!cardId) { res.status(400).json({ error: "cardId is required" }); return; }
  res.setHeader("Cache-Control", "no-store");

  if (cardId.startsWith("pk_")) {
    const pw = await pwGetCard(cardId);
    if (pw.ok) {
      res.json({ pricing: buildPricingFromCatalog(pw.data) });
      return;
    }
    // fall through to TCGdex pricing if available
  }

  const ebayContext = name ? { name, setName, cardNumber } : undefined;
  const pricing = await fetchPricingById(cardId, name, rarity, ebayContext);
  res.json({ pricing });
});

router.get("/cards/:id", async (req, res) => {
  const parsed = GetCardParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [card] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, parsed.data.id));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  const auth = getAuth(req as never);
  const requesterId = auth?.userId ?? null;
  if (card.ownerClerkId !== requesterId && !card.forSale) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(card);
});

router.put("/cards/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const paramsParsed = UpdateCardParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateCardBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existing] = await db
    .select({ ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable)
    .where(eq(cardsTable.id, paramsParsed.data.id));
  if (!existing) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const data = bodyParsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.pokemonName !== undefined) updateData.pokemonName = data.pokemonName;
  if (data.setName !== undefined) updateData.setName = data.setName;
  if (data.cardNumber !== undefined) updateData.cardNumber = data.cardNumber;
  if (data.rarity !== undefined) updateData.rarity = data.rarity;
  if (data.condition !== undefined) updateData.condition = data.condition;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.originalScanUrl !== undefined) updateData.originalScanUrl = data.originalScanUrl;
  if (data.catalogCardId !== undefined) updateData.catalogCardId = data.catalogCardId;
  if (data.estimatedValue !== undefined) updateData.estimatedValue = data.estimatedValue != null ? String(data.estimatedValue) : null;
  if (data.acquiredDate !== undefined) updateData.acquiredDate = data.acquiredDate;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.forSale !== undefined) updateData.forSale = data.forSale;
  if (data.listingPrice !== undefined) updateData.listingPrice = data.listingPrice != null ? String(data.listingPrice) : null;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.cardStory !== undefined) updateData.cardStory = data.cardStory;

  await db
    .update(cardsTable)
    .set(updateData)
    .where(eq(cardsTable.id, paramsParsed.data.id));

  const [updated] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, paramsParsed.data.id));

  await db.insert(activityEventsTable).values({
    type: "card_updated",
    clerkId: userId,
    cardId: updated.id,
    metadata: {
      name: updated.name,
      pokemonName: updated.pokemonName,
      imageUrl: updated.imageUrl,
      setName: updated.setName,
    },
  });

  res.json(updated);
});

router.delete("/cards/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = DeleteCardParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable)
    .where(eq(cardsTable.id, parsed.data.id));
  if (!existing) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(cardsTable).where(eq(cardsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
