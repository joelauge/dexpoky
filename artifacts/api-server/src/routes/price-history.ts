import { Router } from "express";
import { db } from "@workspace/db";
import { cardPriceHistoryTable, cardsTable } from "@workspace/db";
import { fetchPricingById } from "./detect-helpers.js";
import { eq, asc, and, sql } from "drizzle-orm";

const router = Router();

// GET /api/cards/:id/price-history
// Returns stored price snapshots immediately. Triggers a background live-price fetch
// (at most once per calendar day) so future requests will show the new data point.
router.get("/cards/:id/price-history", async (req, res) => {
  const cardId = parseInt(req.params.id, 10);
  if (isNaN(cardId)) { res.status(400).json({ error: "Invalid card id" }); return; }

  const [card] = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      pokemonName: cardsTable.pokemonName,
      cardNumber: cardsTable.cardNumber,
      setName: cardsTable.setName,
      rarity: cardsTable.rarity,
      estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
      createdAt: cardsTable.createdAt,
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

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
  const tcgdexId = buildTcgdexId(card.setName, card.cardNumber);
  if (!tcgdexId) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const hasTodaySnapshot = history.some(
    (h) => new Date(h.recordedAt) >= today,
  );
  if (hasTodaySnapshot) return;

  // Fire-and-forget: fetch live price and store it
  setImmediate(async () => {
    try {
      const pricing = await fetchPricingById(
        tcgdexId,
        card.pokemonName ?? card.name,
        card.rarity ?? undefined,
      );
      if (pricing.marketPrice != null) {
        await db.insert(cardPriceHistoryTable).values({
          cardId,
          price: String(pricing.marketPrice),
          source: pricing.source ?? "tcgplayer",
        });
      }
    } catch {
      // Silently ignore — will retry on next request
    }
  });
});

/**
 * Reconstruct a TCGdex card ID from set name + card number stored in the DB.
 * card.cardNumber may be a full TCGdex ID (e.g. "me03-002") or just the
 * numeric part (e.g. "002"). card.setName holds the human-readable set name.
 */
function buildTcgdexId(setName: string | null, cardNumber: string | null): string | null {
  if (!cardNumber) return null;
  // Already a full TCGdex ID (contains a dash with letter prefix)
  if (/^[a-z]+\d*-\d+/i.test(cardNumber)) return cardNumber;
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
