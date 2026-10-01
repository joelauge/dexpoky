import { Router } from "express";
import { db } from "@workspace/db";
import { cardPriceHistoryTable, cardsTable } from "@workspace/db";
import { fetchPricingById } from "./detect-helpers.js";
import { eq, asc, and, sql, or, isNotNull } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { pwGetCard, buildPricingFromCatalog } from "../lib/pokewallet.js";
import { getTcgcsvPricing, isTcgcsvId } from "../lib/tcgcsv.js";

const router = Router();

type RepriceCandidate = {
  id: number;
  name: string;
  pokemonName: string;
  cardNumber: string | null;
  setName: string | null;
  setId: string | null;
  catalogCardId: string | null;
  rarity: string | null;
  estimatedValue: number | null;
};

export type RepriceOutcome = "corrected" | "unchanged" | "unresolved" | "unavailable";
export type RepriceAction =
  | { outcome: "corrected"; value: number }
  | { outcome: "unchanged" }
  | { outcome: "unresolved"; clearValue: true }
  | { outcome: "unavailable"; preserveValue: true };

export function classifyReprice(
  currentValue: number | null,
  exactValue: number | null,
  lookupStatus: "resolved" | "unresolved" | "unavailable",
): RepriceOutcome {
  if (lookupStatus === "unavailable") return "unavailable";
  if (lookupStatus === "unresolved") return "unresolved";
  if (exactValue == null) return "unavailable";
  return currentValue != null && Math.abs(currentValue - exactValue) < 0.005
    ? "unchanged"
    : "corrected";
}

export function buildRepriceAction(
  currentValue: number | null,
  exactValue: number | null,
  lookupStatus: "resolved" | "unresolved" | "unavailable",
): RepriceAction {
  const outcome = classifyReprice(currentValue, exactValue, lookupStatus);
  if (outcome === "corrected") return { outcome, value: exactValue as number };
  if (outcome === "unresolved") return { outcome, clearValue: true };
  if (outcome === "unavailable") return { outcome, preserveValue: true };
  return { outcome };
}

export async function fetchExactPrice(card: RepriceCandidate): Promise<{
  marketPrice: number | null;
  source: string | null;
  identity: string | null;
  status: "resolved" | "unresolved" | "unavailable";
}> {
  if (card.catalogCardId?.startsWith("tcgcsv_")) {
    if (!isTcgcsvId(card.catalogCardId)) {
      return {
        marketPrice: null,
        source: null,
        identity: card.catalogCardId,
        status: "unavailable",
      };
    }
    const pricing = await getTcgcsvPricing(card.catalogCardId);
    return {
      marketPrice: pricing.marketPrice,
      source: pricing.source,
      identity: card.catalogCardId,
      status: pricing.marketPrice == null ? "unavailable" : "resolved",
    };
  }

  if (card.catalogCardId?.startsWith("pk_")) {
    const result = await pwGetCard(card.catalogCardId);
    if (!result.ok) {
      return {
        marketPrice: null,
        source: null,
        identity: card.catalogCardId,
        status: result.reason === "NOT_FOUND" ? "unresolved" : "unavailable",
      };
    }
    const pricing = buildPricingFromCatalog(result.data);
    return {
      marketPrice: pricing.marketPrice,
      source: pricing.source,
      identity: card.catalogCardId,
      status: pricing.marketPrice == null ? "unresolved" : "resolved",
    };
  }

  const identity = buildTcgdexId(
    card.catalogCardId,
    card.setId,
    card.setName,
    card.cardNumber,
  );
  if (!identity) {
    return { marketPrice: null, source: null, identity: null, status: "unresolved" };
  }
  const pricing = await fetchPricingById(
    identity,
    card.pokemonName || card.name,
    card.rarity ?? undefined,
  );
  return {
    marketPrice: pricing.marketPrice,
    source: pricing.source,
    identity,
    // The exact-ID pricing chain currently returns the same empty result for
    // upstream failures and no-price responses. Preserve the old value rather
    // than destructively treating that ambiguity as confirmed no-price.
    status: pricing.marketPrice == null ? "unavailable" : "resolved",
  };
}

async function repriceOwnedCard(
  ownerClerkId: string,
  card: RepriceCandidate,
): Promise<RepriceOutcome> {
  const pricing = await fetchExactPrice(card);
  const action = buildRepriceAction(card.estimatedValue, pricing.marketPrice, pricing.status);
  const outcome = action.outcome;

  if (outcome === "unresolved" || outcome === "unavailable") {
    if (action.outcome === "unresolved" && card.estimatedValue != null) {
      await db.update(cardsTable)
        .set({ estimatedValue: null, updatedAt: new Date() })
        .where(and(eq(cardsTable.id, card.id), eq(cardsTable.ownerClerkId, ownerClerkId)));
    }
    return outcome;
  }

  if (outcome === "unchanged") return outcome;

  await db.transaction(async (tx) => {
    const updated = await tx.update(cardsTable)
      .set({
        estimatedValue: String(pricing.marketPrice),
        updatedAt: new Date(),
        ...(!card.catalogCardId && pricing.identity
          ? { catalogCardId: pricing.identity }
          : {}),
      })
      .where(and(eq(cardsTable.id, card.id), eq(cardsTable.ownerClerkId, ownerClerkId)))
      .returning({ id: cardsTable.id });
    if (updated.length === 0) return;
    await tx.insert(cardPriceHistoryTable).values({
      cardId: card.id,
      price: String(pricing.marketPrice),
      source: `exact:${pricing.source ?? "catalog"}`,
    });
  });
  return outcome;
}

// POST /api/cards/reprice
// Repairs the authenticated owner's stored collection values using only exact-printing prices.
router.post("/cards/reprice", requireAuth, async (req, res): Promise<void> => {
  const ownerClerkId = (req as AuthRequest).userId;
  const cards = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    pokemonName: cardsTable.pokemonName,
    cardNumber: cardsTable.cardNumber,
    setName: cardsTable.setName,
    setId: cardsTable.setId,
    catalogCardId: cardsTable.catalogCardId,
    rarity: cardsTable.rarity,
    estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
  }).from(cardsTable).where(and(
    eq(cardsTable.ownerClerkId, ownerClerkId),
    or(
      isNotNull(cardsTable.catalogCardId),
      and(isNotNull(cardsTable.setId), isNotNull(cardsTable.cardNumber)),
      and(isNotNull(cardsTable.setName), isNotNull(cardsTable.cardNumber)),
    ),
  ));

  const counts = { corrected: 0, unchanged: 0, unresolved: 0, unavailable: 0 };
  const batchSize = 4;
  for (let index = 0; index < cards.length; index += batchSize) {
    const outcomes = await Promise.all(
      cards.slice(index, index + batchSize).map((card) => repriceOwnedCard(ownerClerkId, card)),
    );
    for (const outcome of outcomes) counts[outcome] += 1;
  }

  res.json({ ...counts, total: cards.length });
});

// GET /api/cards/:id/price-history
// Returns stored price snapshots immediately. Triggers a background live-price fetch
// (at most once per calendar day) so future requests will show the new data point.
router.get("/cards/:id/price-history", requireAuth, async (req, res) => {
  const rawCardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const cardId = parseInt(rawCardId, 10);
  if (isNaN(cardId)) { res.status(400).json({ error: "Invalid card id" }); return; }
  const ownerClerkId = (req as AuthRequest).userId;

  const [card] = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      pokemonName: cardsTable.pokemonName,
      cardNumber: cardsTable.cardNumber,
      setName: cardsTable.setName,
      setId: cardsTable.setId,
      catalogCardId: cardsTable.catalogCardId,
      rarity: cardsTable.rarity,
      estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
      createdAt: cardsTable.createdAt,
    })
    .from(cardsTable)
    .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, ownerClerkId)));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  // Load existing history sorted oldest-first
  const history = await db
    .select({
      id: cardPriceHistoryTable.id,
      price: sql<number>`${cardPriceHistoryTable.price}::float`,
      source: cardPriceHistoryTable.source,
      recordedAt: cardPriceHistoryTable.recordedAt,
    })
    .from(cardPriceHistoryTable)
    .where(eq(cardPriceHistoryTable.cardId, cardId))
    .orderBy(asc(cardPriceHistoryTable.recordedAt));

  // Build the response — seed with estimatedValue if no snapshots yet
  const points = [...history];
  if (points.length === 0 && card.estimatedValue != null) {
    points.push({
      id: -1,
      price: card.estimatedValue,
      source: "initial",
      recordedAt: card.createdAt,
    });
  }

  // ── Respond immediately — don't block on live fetch ──────────────────────
  res.json({ history: points });

  // ── Background: add today's live snapshot if we haven't yet ──────────────
  const hasExactIdentity = Boolean(
    (card.catalogCardId && (isTcgcsvId(card.catalogCardId) || card.catalogCardId.startsWith("pk_")))
    || buildTcgdexId(card.catalogCardId, card.setId, card.setName, card.cardNumber),
  );
  if (!hasExactIdentity) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasTodaySnapshot = history.some(
    (h) => new Date(h.recordedAt) >= today,
  );
  if (hasTodaySnapshot) return;

  // Fire-and-forget: fetch live price and store it
  setImmediate(async () => {
    try {
      const pricing = await fetchExactPrice(card);
      if (pricing.marketPrice != null) {
        await db.insert(cardPriceHistoryTable).values({
          cardId,
          price: String(pricing.marketPrice),
          source: pricing.source ?? "catalog",
        });
        const identity: Record<string, unknown> = {
          estimatedValue: String(pricing.marketPrice),
          updatedAt: new Date(),
        };
        if (!card.catalogCardId && pricing.identity) identity.catalogCardId = pricing.identity;
        if (!card.setId && pricing.identity && !isTcgcsvId(pricing.identity)) {
          identity.setId = pricing.identity.slice(0, pricing.identity.lastIndexOf("-"));
        }
        await db.update(cardsTable).set(identity).where(eq(cardsTable.id, cardId));
      }
    } catch {
      // Silently ignore — will retry on next request
    }
  });
});

// POST /api/cards/:id/price-history/refresh
// Retrieves an exact-printing price now and records a timestamped snapshot,
// including when the retrieved value is unchanged.
router.post("/cards/:id/price-history/refresh", requireAuth, async (req, res) => {
  const rawCardId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const cardId = parseInt(rawCardId, 10);
  if (isNaN(cardId)) { res.status(400).json({ error: "Invalid card id" }); return; }
  const ownerClerkId = (req as AuthRequest).userId;

  const [card] = await db.select({
    id: cardsTable.id,
    name: cardsTable.name,
    pokemonName: cardsTable.pokemonName,
    cardNumber: cardsTable.cardNumber,
    setName: cardsTable.setName,
    setId: cardsTable.setId,
    catalogCardId: cardsTable.catalogCardId,
    rarity: cardsTable.rarity,
    estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
  }).from(cardsTable).where(and(
    eq(cardsTable.id, cardId),
    eq(cardsTable.ownerClerkId, ownerClerkId),
  ));

  if (!card) { res.status(404).json({ error: "Card not found" }); return; }

  const pricing = await fetchExactPrice(card);
  if (pricing.status === "unresolved") {
    res.status(422).json({ error: "The exact card printing could not be identified. Confirm its set and card number first." });
    return;
  }
  if (pricing.status === "unavailable" || pricing.marketPrice == null) {
    res.status(503).json({ error: "The latest exact-printing price is temporarily unavailable. Your current value was kept." });
    return;
  }

  const recordedAt = new Date();
  const [point] = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(cardPriceHistoryTable).values({
      cardId,
      price: String(pricing.marketPrice),
      source: `refresh:${pricing.source ?? "catalog"}`,
      recordedAt,
    }).returning({
      id: cardPriceHistoryTable.id,
      price: sql<number>`${cardPriceHistoryTable.price}::float`,
      source: cardPriceHistoryTable.source,
      recordedAt: cardPriceHistoryTable.recordedAt,
    });

    await tx.update(cardsTable).set({
      estimatedValue: String(pricing.marketPrice),
      updatedAt: recordedAt,
      ...(!card.catalogCardId && pricing.identity ? { catalogCardId: pricing.identity } : {}),
    }).where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, ownerClerkId)));

    return [inserted];
  });

  res.setHeader("Cache-Control", "no-store");
  res.json({ point, estimatedValue: pricing.marketPrice });
});

/**
 * Reconstruct a TCGdex card ID from set name + card number stored in the DB.
 * card.cardNumber may be a full TCGdex ID (e.g. "me03-002") or just the
 * numeric part (e.g. "002"). card.setName holds the human-readable set name.
 */
export function buildTcgdexId(
  catalogCardId: string | null,
  setId: string | null,
  setName: string | null,
  cardNumber: string | null,
): string | null {
  if (catalogCardId?.startsWith("tcgcsv_")) return null;
  if (catalogCardId && /^[a-z][a-z0-9]*-\d+/i.test(catalogCardId)) return catalogCardId;
  if (!cardNumber) return null;
  // Already a full TCGdex ID (contains a dash with letter prefix)
  if (/^[a-z]+\d*-\d+/i.test(cardNumber)) return cardNumber;
  if (setId && /^[a-z][a-z0-9]*$/i.test(setId)) return `${setId}-${cardNumber}`;
  if (!setName) return null;
  const setAlias = SET_ALIAS_MAP[setName.toLowerCase()];
  if (!setAlias) return null;
  return `${setAlias}-${cardNumber}`;
}

const SET_ALIAS_MAP: Record<string, string> = {
  "perfect order": "me03",
  "me03: perfect order": "me03",
  "celestial storm": "sm7",
  "sm7: celestial storm": "sm7",
  "crimson invasion": "sm4",
  "sm4: crimson invasion": "sm4",
  "twilight masquerade": "sv6",
  "sv06: twilight masquerade": "sv6",
  "ancient origins": "xy7",
  "xy7: ancient origins": "xy7",
  "aquapolis": "ecard2",
  "silver tempest": "swsh12",
  "swsh12: silver tempest": "swsh12",
  "unseen forces": "ex12",
  "chaos rising": "me04",
  "me04: chaos rising": "me04",
  "scarlet & violet": "sv1",
  "sv01: scarlet & violet": "sv1",
  "paldea evolved": "sv2",
  "sv02: paldea evolved": "sv2",
  "obsidian flames": "sv3",
  "sv03: obsidian flames": "sv3",
  "paradox rift": "sv4",
  "sv04: paradox rift": "sv4",
  "temporal forces": "sv5",
  "sv05: temporal forces": "sv5",
  "surging sparks": "sv8",
  "sv08: surging sparks": "sv8",
  "prismatic evolutions": "sv8pt5",
  "crown zenith": "swsh12pt5",
  "astral radiance": "swsh10",
  "swsh10: astral radiance": "swsh10",
  "brilliant stars": "swsh9",
  "swsh09: brilliant stars": "swsh9",
  "fusion strike": "swsh8",
  "swsh08: fusion strike": "swsh8",
  "battle styles": "swsh5",
  "swsh05: battle styles": "swsh5",
  "chilling reign": "swsh6",
  "swsh06: chilling reign": "swsh6",
  "evolving skies": "swsh7",
  "swsh07: evolving skies": "swsh7",
};

export default router;
