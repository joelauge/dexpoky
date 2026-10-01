import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, collectionsTable, activityEventsTable } from "@workspace/db";
import {
  searchTcgdex,
  fetchPricingById,
  rankTcgResults,
  type PricingData,
  type TcgResult,
} from "./detect-helpers.js";
import {
  pwSearch,
  pwGetCard,
  normalizeCatalogCard,
  buildPricingFromCatalog,
  enrichCatalogCardImages,
} from "../lib/pokewallet.js";
import { eq, sql, ilike, and, inArray, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { evaluateCardConfidence, type CardConfidenceInput } from "../lib/card-confidence.js";
import { BoundedAsyncCache, normalizeLookupKey, recordLookup } from "../lib/lookup-performance.js";
import { selectScanPrinting, type ScanPrintingCandidate } from "../lib/scan-printing-selection.js";
import { resolveRankedScan } from "../lib/scan-lookup-ranking.js";
import { searchTcgcsv } from "../lib/tcgcsv.js";
import { mergeScanCatalog } from "../lib/scan-catalog-merge.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  canonicalCardMediaObjectPath,
  CardMediaInspectorUnavailableError,
  CardMediaValidationError,
  inspectStoredCardMedia,
  verifyCardMediaUploadClaim,
  type CardMediaInput,
} from "../lib/card-media.js";
import {
  ListCardsQueryParams,
  CreateCardBody,
  UpdateCardBody,
  BulkCreateCardsBody,
  BulkUpdateCardsBody,
  GetCardParams,
  UpdateCardParams,
  DeleteCardParams,
  AddCardMediaBody,
} from "@workspace/api-zod";

const router = Router();
const objectStorageService = new ObjectStorageService();
const scanLookupCache = new BoundedAsyncCache<{
  card: TcgResult | null;
  variants: TcgResult[];
  pricing: PricingData;
  freshness: { identityTtlSeconds: number; pricingPolicy: string };
}>(150, 15 * 60 * 1000);

export function buildOwnedCardConditions(
  userId: string,
  filters: { categoryId?: number; forSale?: boolean; search?: string; rarity?: string },
): SQL[] {
  const conditions: SQL[] = [eq(cardsTable.ownerClerkId, userId)];
  if (filters.categoryId !== undefined) conditions.push(eq(cardsTable.categoryId, filters.categoryId));
  if (filters.forSale !== undefined) conditions.push(eq(cardsTable.forSale, filters.forSale));
  if (filters.search) {
    const normalized = filters.search.trim();
    const tsQuery = sql`websearch_to_tsquery('simple', ${normalized})`;
    conditions.push(sql`(
      to_tsvector('simple', coalesce(${cardsTable.name}, '') || ' ' || coalesce(${cardsTable.pokemonName}, '') || ' ' ||
        coalesce(${cardsTable.setName}, '') || ' ' || coalesce(${cardsTable.setId}, '') || ' ' || coalesce(${cardsTable.cardNumber}, ''))
      @@ ${tsQuery}
      OR ${cardsTable.name} ILIKE ${`${normalized}%`}
      OR ${cardsTable.pokemonName} ILIKE ${`${normalized}%`}
      OR ${cardsTable.setName} ILIKE ${`${normalized}%`}
      OR ${cardsTable.setId} ILIKE ${`${normalized}%`}
      OR ${cardsTable.cardNumber} ILIKE ${`${normalized}%`}
    )`);
  }
  if (filters.rarity) conditions.push(eq(cardsTable.rarity, filters.rarity));
  return conditions;
}

/** Ephemeral scan evidence scoring. The API key never leaves the server. */
router.post("/cards/confidence", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Partial<CardConfidenceInput>;
  if (!body || typeof body !== "object" || !body.observed || !body.candidate) {
    res.status(400).json({ error: "observed and candidate evidence are required" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(await evaluateCardConfidence(body as CardConfidenceInput));
});

/** Owner-only score for a saved card. Identity and exact price are server-derived. */
router.post("/cards/:id/confidence", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = (req as AuthRequest).userId;
  const [saved] = await db.select({
    id: cardsTable.id, name: cardsTable.name, pokemonName: cardsTable.pokemonName,
    setId: cardsTable.setId, setName: cardsTable.setName, cardNumber: cardsTable.cardNumber,
    catalogCardId: cardsTable.catalogCardId, condition: cardsTable.condition,
  }).from(cardsTable).where(and(eq(cardsTable.id, id), eq(cardsTable.ownerClerkId, userId)));
  if (!saved) { res.status(404).json({ error: "Card not found" }); return; }
  const pricing = saved.catalogCardId
    ? await fetchPricingById(saved.catalogCardId, saved.name, undefined, {
      name: saved.name, setName: saved.setName ?? undefined, cardNumber: saved.cardNumber ?? undefined,
    })
    : null;
  const result = await evaluateCardConfidence({
    observed: { ocrName: saved.name, ocrSetCode: saved.setId, ocrCardNumber: saved.cardNumber, visionConfidence: null },
    candidate: { id: saved.catalogCardId ?? String(saved.id), name: saved.name, setId: saved.setId, setName: saved.setName, cardNumber: saved.cardNumber },
    pricing,
    condition: { value: saved.condition, source: "saved_card" },
    context: { savedCardId: saved.id, pokemonName: saved.pokemonName },
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});

const cardSelect = {
  id: cardsTable.id,
  name: cardsTable.name,
  pokemonName: cardsTable.pokemonName,
  setName: cardsTable.setName,
  setId: cardsTable.setId,
  cardNumber: cardsTable.cardNumber,
  rarity: cardsTable.rarity,
  condition: cardsTable.condition,
  imageUrl: cardsTable.imageUrl,
  originalScanUrl: cardsTable.originalScanUrl,
  media: cardsTable.media,
  catalogCardId: cardsTable.catalogCardId,
  estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
  acquiredDate: cardsTable.acquiredDate,
  categoryId: cardsTable.categoryId,
  categoryName: categoriesTable.name,
  collectionId: cardsTable.collectionId,
  collectionName: collectionsTable.name,
  forSale: cardsTable.forSale,
  listingPrice: sql<number | null>`${cardsTable.listingPrice}::float`,
  notes: cardsTable.notes,
  cardStory: cardsTable.cardStory,
  ownerClerkId: cardsTable.ownerClerkId,
  agentAcquiredAt: cardsTable.agentAcquiredAt,
  createdAt: cardsTable.createdAt,
  updatedAt: cardsTable.updatedAt,
};

router.post("/cards/bulk", requireAuth, async (req, res): Promise<void> => {
  const parsed = BulkCreateCardsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error }); return; }
  const userId = (req as AuthRequest).userId;
  const collectionIds = [...new Set(parsed.data.cards.map((card) => card.collectionId).filter((id): id is number => id != null))];
  const existingCollections = collectionIds.length
    ? await db.select({ id: collectionsTable.id }).from(collectionsTable)
      .where(and(eq(collectionsTable.ownerClerkId, userId), inArray(collectionsTable.id, collectionIds)))
    : [];
  if (existingCollections.length !== collectionIds.length) { res.status(400).json({ error: "Invalid collection" }); return; }

  const result = await db.transaction(async (tx) => {
    const createdIds: number[] = [];
    for (const item of parsed.data.cards) {
      const [created] = await tx.insert(cardsTable).values({
        ownerClerkId: userId,
        name: item.name,
        pokemonName: item.name,
        setName: item.setName,
        setId: item.setId,
        cardNumber: item.cardNumber,
        rarity: item.rarity,
        condition: item.condition ?? "near_mint",
        imageUrl: item.imageUrl ?? null,
        catalogCardId: item.catalogCardId,
        estimatedValue: item.estimatedValue != null ? String(item.estimatedValue) : null,
        originalScanUrl: item.originalScanUrl ?? null,
        collectionId: item.collectionId ?? null,
        forSale: false,
      }).returning({ id: cardsTable.id });
      createdIds.push(created.id);
    }
    return { createdIds };
  });
  const created = result.createdIds.length ? await db.select(cardSelect).from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
    .where(inArray(cardsTable.id, result.createdIds)) : [];
  res.status(201).json({ created, skipped: [] });
});

router.put("/cards/bulk-update", requireAuth, async (req, res): Promise<void> => {
  const parsed = BulkUpdateCardsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error }); return; }
  const userId = (req as AuthRequest).userId;
  const collectionId = parsed.data.collectionId;
  if (collectionId != null) {
    const [collection] = await db.select({ id: collectionsTable.id }).from(collectionsTable)
      .where(and(eq(collectionsTable.id, collectionId), eq(collectionsTable.ownerClerkId, userId)));
    if (!collection) { res.status(400).json({ error: "Invalid collection" }); return; }
  }
  const owned = await db.select({ id: cardsTable.id }).from(cardsTable)
    .where(and(eq(cardsTable.ownerClerkId, userId), inArray(cardsTable.id, parsed.data.cardIds)));
  if (owned.length !== parsed.data.cardIds.length) { res.status(403).json({ error: "One or more cards are not owned by you" }); return; }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.collectionId !== undefined) update.collectionId = parsed.data.collectionId;
  if (parsed.data.condition !== undefined) update.condition = parsed.data.condition;
  if (parsed.data.estimatedValue !== undefined) update.estimatedValue = parsed.data.estimatedValue == null ? null : String(parsed.data.estimatedValue);
  await db.update(cardsTable).set(update).where(and(eq(cardsTable.ownerClerkId, userId), inArray(cardsTable.id, parsed.data.cardIds)));
  const updated = await db.select(cardSelect).from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
    .where(inArray(cardsTable.id, parsed.data.cardIds));
  res.json({ updated, count: updated.length });
});

router.get("/cards", requireAuth, async (req, res) => {
  const startedAt = performance.now();
  const userId = (req as AuthRequest).userId;
  const parsed = ListCardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { categoryId, forSale, search, rarity } = parsed.data;
  const conditions = buildOwnedCardConditions(userId, { categoryId, forSale, search, rarity });

  const cards = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
    .where(and(...conditions))
    .orderBy(
      search
        ? sql`CASE
            WHEN lower(coalesce(${cardsTable.setId}, '')) = lower(${search}) OR lower(coalesce(${cardsTable.cardNumber}, '')) = lower(${search}) THEN 0
            WHEN lower(${cardsTable.name}) = lower(${search}) OR lower(${cardsTable.pokemonName}) = lower(${search}) THEN 1
            ELSE 2
          END`
        : cardsTable.createdAt,
      cardsTable.createdAt,
    );

  recordLookup("owned", performance.now() - startedAt);
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
  if (data.collectionId != null) {
    const [collection] = await db.select({ id: collectionsTable.id }).from(collectionsTable)
      .where(and(eq(collectionsTable.id, data.collectionId), eq(collectionsTable.ownerClerkId, userId)));
    if (!collection) { res.status(400).json({ error: "Invalid collection" }); return; }
  }

  const [card] = await db.insert(cardsTable).values({
    ownerClerkId: userId,
    name: data.name,
    pokemonName: data.pokemonName,
    rarity: data.rarity,
    condition: data.condition,
    forSale: data.forSale,
    setName: data.setName ?? null,
    setId: data.setId ?? null,
    cardNumber: data.cardNumber ?? null,
    imageUrl: data.imageUrl ?? null,
    originalScanUrl: data.originalScanUrl ?? null,
    catalogCardId: data.catalogCardId ?? null,
    estimatedValue: data.estimatedValue != null ? String(data.estimatedValue) : null,
    acquiredDate: data.acquiredDate ?? null,
    categoryId: data.categoryId ?? null,
    collectionId: data.collectionId ?? null,
    listingPrice: data.listingPrice != null ? String(data.listingPrice) : null,
    notes: data.notes ?? null,
    cardStory: data.cardStory ?? null,
  }).returning();

  const [withCat] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
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
router.get("/cards/lookup", (req, res, next) => {
  if (req.query.resolvePrinting === "true") return requireAuth(req, res, next);
  return next();
}, async (req, res) => {
  const startedAt = performance.now();
  const name = String(req.query.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required" }); return; }

  const resolveParam = req.query.resolvePrinting;
  if (resolveParam !== undefined && resolveParam !== "true" && resolveParam !== "false") {
    res.status(400).json({ error: "resolvePrinting must be true or false" });
    return;
  }
  const resolvePrinting = resolveParam === "true";

  // Optional hint fields extracted from the card image by the vision model.
  // When provided they are used to float the exact printing to position [0].
  const cardNumber = String(req.query.cardNumber ?? "").trim() || undefined;
  const setCode = String(req.query.setCode ?? "").trim() || undefined;

  let visionConfidence: "high" | "medium" | "low" | undefined;
  let visualSummary: string | undefined;
  let hp: number | undefined;
  if (resolvePrinting) {
    const confidenceParam = req.query.visionConfidence;
    if (confidenceParam !== undefined && confidenceParam !== "high" &&
        confidenceParam !== "medium" && confidenceParam !== "low") {
      res.status(400).json({ error: "visionConfidence must be high, medium, or low" });
      return;
    }
    visionConfidence = confidenceParam as "high" | "medium" | "low" | undefined;
    const summaryParam = req.query.visualSummary;
    if (summaryParam !== undefined && (typeof summaryParam !== "string" || summaryParam.length > 1000)) {
      res.status(400).json({ error: "visualSummary must be at most 1000 characters" });
      return;
    }
    visualSummary = typeof summaryParam === "string" ? summaryParam.trim() || undefined : undefined;
    const hpParam = req.query.hp;
    if (hpParam !== undefined) {
      if (typeof hpParam !== "string" || !/^\d+$/.test(hpParam.trim())) {
        res.status(400).json({ error: "hp must be an integer from 0 to 10000" });
        return;
      }
      const parsedHp = Number(hpParam.trim());
      if (!Number.isSafeInteger(parsedHp) || parsedHp < 0 || parsedHp > 10_000) {
        res.status(400).json({ error: "hp must be an integer from 0 to 10000" });
        return;
      }
      hp = parsedHp;
    }
  }
  const cacheKey = normalizeLookupKey(name, cardNumber, setCode);
  const externalStartedAt = performance.now();
  const cached = scanLookupCache.get(cacheKey);
  const loaded = cached
    ? { value: cached, status: "hit" as const }
    : await scanLookupCache.getOrLoad(cacheKey, async () => {
      const primaryLookup = async () => {
      const pw = await pwSearch(name, 100);
      // TCGdex is authoritative for OCR set/number identity. Keep this exact
      // hinted merge inside the identity-keyed catalog cache.
      if (cardNumber && setCode) {
        const tcg = await searchTcgdex(name, cardNumber, setCode);
        if (pw.ok && pw.data.results.length > 0) {
          const catalog = await enrichCatalogCardImages(pw.data.results.map(normalizeCatalogCard));
          const catalogVariants = catalog.map((v) => ({
            id: v.id, name: v.name, imageUrl: v.imageUrl, setName: v.setName,
            setId: v.setCode, cardNumber: v.cardNumber, rarity: v.rarity,
          }));
          const variants = rankTcgResults([...tcg.variants, ...catalogVariants], name, cardNumber, setCode);
          const top = variants[0];
          const catalogTop = top ? pw.data.results.find((r) => r.id === top.id) : undefined;
          return {
            card: top ?? null,
            variants,
            pricing: catalogTop ? buildPricingFromCatalog(catalogTop) : tcg.pricing,
            freshness: { identityTtlSeconds: 900, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
          };
        }
        if (tcg.variants.length > 0) {
          return {
            card: tcg.variants[0],
            variants: tcg.variants,
            pricing: tcg.pricing,
            freshness: { identityTtlSeconds: 900, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
          };
        }
      }
      if (pw.ok && pw.data.results.length > 0) {
        const normalized = pw.data.results.map(normalizeCatalogCard);
        const enriched = await enrichCatalogCardImages(normalized);
        const variants = enriched.map((v) => ({
          id: v.id,
          name: v.name,
          imageUrl: v.imageUrl,
          setName: v.setName,
          setId: v.setCode,
          cardNumber: v.cardNumber,
          rarity: v.rarity,
        }));

        // Preserve every name candidate, but rank using set + number first.
        const ranked = rankTcgResults(variants, name, cardNumber, setCode);
        const topId = ranked[0]?.id;
        const topRaw = topId ? pw.data.results.find((r) => r.id === topId) : undefined;
        const pricing = topRaw ? buildPricingFromCatalog(topRaw) : {
          marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null,
        };
        return {
          card: ranked[0] ?? null,
          variants: ranked,
          pricing,
          freshness: { identityTtlSeconds: 900, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
        };
      }

      // Fallback to TCGdex using the original identifier hints and ranking.
      const { variants, pricing } = await searchTcgdex(name, cardNumber, setCode);
      return {
        card: variants[0] ?? null,
        variants,
        pricing,
        freshness: { identityTtlSeconds: 900, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
      };
      };
      const [primary, supplemental] = await Promise.all([
        primaryLookup(), searchTcgcsv(name, cardNumber, setCode),
      ]);
      const merged = await mergeScanCatalog(primary, supplemental, { name, cardNumber, setCode },
        (card) => fetchPricingById(card.id, card.name, card.rarity ?? undefined, {
          name: card.name, setName: card.setName, cardNumber: card.cardNumber,
        }));
      return { ...primary, ...merged };
    });
  const baseResponse = loaded.value;
  if (!resolvePrinting) {
    recordLookup("scan", performance.now() - startedAt, {
      cache: loaded.status,
      externalMs: loaded.status === "miss" ? performance.now() - externalStartedAt : undefined,
    });
    res.json(baseResponse);
    return;
  }

  const candidates: ScanPrintingCandidate[] = baseResponse.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    setId: variant.setId,
    setName: variant.setName,
    cardNumber: variant.cardNumber,
    rarity: variant.rarity,
  }));
  const evaluation = await selectScanPrinting(candidates, {
    name,
    setCode,
    cardNumber,
    visionConfidence,
    visualSummary,
    hp,
  });
  const ranked = await resolveRankedScan(baseResponse, evaluation, async (selectedCard) => {
    if (selectedCard.id.startsWith("pk_")) {
      const detail = await pwGetCard(selectedCard.id);
      return detail.ok ? buildPricingFromCatalog(detail.data) : {
        marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null,
      };
    }
    return fetchPricingById(selectedCard.id, selectedCard.name, selectedCard.rarity ?? undefined, {
      name: selectedCard.name,
      setName: selectedCard.setName,
      cardNumber: selectedCard.cardNumber,
    });
  });
  const selection = ranked.selection;
  recordLookup("scan", performance.now() - startedAt, {
    cache: loaded.status,
    externalMs: loaded.status === "miss" ? performance.now() - externalStartedAt : undefined,
    jev: candidates.length === 0 || selection.status === "exact" ? "skipped" :
      selection.status === "unavailable" ? "fallback" : "invoked",
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ...ranked,
    freshness: baseResponse.freshness,
  });
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

router.post("/cards/:id/media", requireAuth, async (req, res): Promise<void> => {
  const cardId = Number(req.params.id);
  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }
  const parsed = AddCardMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media request", details: parsed.error });
    return;
  }
  if (!Number.isSafeInteger(parsed.data.width) || !Number.isSafeInteger(parsed.data.height)) {
    res.status(400).json({ error: "Media dimensions must be integers" });
    return;
  }

  const userId = (req as AuthRequest).userId;
  const [card] = await db.select({ ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable).where(eq(cardsTable.id, cardId));
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }
  if (card.ownerClerkId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const input = parsed.data as CardMediaInput;
  const objectPath = canonicalCardMediaObjectPath(input.url);
  if (!objectPath) {
    res.status(400).json({ error: "Media URL must be an uploaded /api/storage/objects/... file" });
    return;
  }
  let validClaim: boolean;
  try {
    validClaim = verifyCardMediaUploadClaim(input.uploadClaim, userId, objectPath);
  } catch {
    res.status(500).json({ error: "Card media upload proof verification is not configured on this server" });
    return;
  }
  if (!validClaim) {
    res.status(403).json({ error: "Upload proof is invalid, expired, or belongs to another user" });
    return;
  }

  let verified: Awaited<ReturnType<typeof inspectStoredCardMedia>>;
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    verified = await inspectStoredCardMedia(file, input);
  } catch (error) {
    if (error instanceof CardMediaInspectorUnavailableError) {
      res.status(503).json({ error: error.message });
      return;
    }
    if (error instanceof CardMediaValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    const notFound = error instanceof Error && error.name === "ObjectNotFoundError";
    if (notFound) {
      res.status(400).json({ error: "Upload is not present in object storage yet" });
      return;
    }
    req.log.error({ err: error }, "Failed to inspect uploaded card media");
    res.status(500).json({ error: "Unable to verify uploaded media" });
    return;
  }

  const media = {
    id: randomUUID(),
    url: input.url,
    kind: input.kind,
    width: verified.width,
    height: verified.height,
    ...(input.kind === "video" ? { durationSeconds: verified.durationSeconds } : {}),
  };
  const [updated] = await db.update(cardsTable)
    .set({
      media: sql`coalesce(${cardsTable.media}, '[]'::jsonb) || ${JSON.stringify([media])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(cardsTable.id, cardId),
      eq(cardsTable.ownerClerkId, userId),
      sql`jsonb_array_length(coalesce(${cardsTable.media}, '[]'::jsonb)) < 20`,
    ))
    .returning({ id: cardsTable.id });
  if (!updated) {
    const [current] = await db.select({
      ownerClerkId: cardsTable.ownerClerkId,
      id: cardsTable.id,
    }).from(cardsTable).where(eq(cardsTable.id, cardId));
    if (!current) { res.status(404).json({ error: "Card not found" }); return; }
    if (current.ownerClerkId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
    res.status(409).json({ error: "This card already has the maximum of 20 gallery items" });
    return;
  }
  res.status(201).json(media);
});

router.delete("/cards/:id/media/:mediaId", requireAuth, async (req, res): Promise<void> => {
  const cardId = Number(req.params.id);
  const mediaIdParam = req.params.mediaId;
  if (!Number.isSafeInteger(cardId) || cardId <= 0 ||
      typeof mediaIdParam !== "string" || !/^[0-9a-f-]{36}$/i.test(mediaIdParam)) {
    res.status(400).json({ error: "Invalid card or media id" });
    return;
  }
  const mediaId = mediaIdParam;
  const userId = (req as AuthRequest).userId;
  const [card] = await db.select({ ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable).where(eq(cardsTable.id, cardId));
  if (!card) { res.status(404).json({ error: "Card not found" }); return; }
  if (card.ownerClerkId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const matchingMedia = sql`EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(${cardsTable.media}, '[]'::jsonb)) AS entry(value)
    WHERE entry.value->>'id' = ${mediaId}
  )`;
  const [removed] = await db.update(cardsTable)
    .set({
      media: sql`coalesce((
        SELECT jsonb_agg(item.value ORDER BY item.ordinality)
        FROM jsonb_array_elements(coalesce(${cardsTable.media}, '[]'::jsonb))
          WITH ORDINALITY AS item(value, ordinality)
        WHERE item.value->>'id' <> ${mediaId}
      ), '[]'::jsonb)`,
      updatedAt: new Date(),
    })
    .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, userId), matchingMedia))
    .returning({ id: cardsTable.id });
  if (!removed) { res.status(404).json({ error: "Gallery item not found" }); return; }
  res.status(204).send();
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
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
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
  if (data.setId !== undefined) updateData.setId = data.setId;
  if (data.cardNumber !== undefined) updateData.cardNumber = data.cardNumber;
  if (data.rarity !== undefined) updateData.rarity = data.rarity;
  if (data.condition !== undefined) updateData.condition = data.condition;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.originalScanUrl !== undefined) updateData.originalScanUrl = data.originalScanUrl;
  if (data.catalogCardId !== undefined) updateData.catalogCardId = data.catalogCardId;
  if (data.estimatedValue !== undefined) updateData.estimatedValue = data.estimatedValue != null ? String(data.estimatedValue) : null;
  if (data.acquiredDate !== undefined) updateData.acquiredDate = data.acquiredDate;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.collectionId !== undefined) {
    if (data.collectionId != null) {
      const [collection] = await db.select({ id: collectionsTable.id }).from(collectionsTable)
        .where(and(eq(collectionsTable.id, data.collectionId), eq(collectionsTable.ownerClerkId, userId)));
      if (!collection) { res.status(400).json({ error: "Invalid collection" }); return; }
    }
    updateData.collectionId = data.collectionId;
  }
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
    .leftJoin(collectionsTable, eq(collectionsTable.id, cardsTable.collectionId))
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
