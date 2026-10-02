import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, cardsTable, cardPriceHistoryTable } from "@workspace/db";
import { GetPricingLookupQueryParams, SaveCardValueSnapshotBody } from "@workspace/api-zod";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { lookupCardPrices, type PriceComparison } from "../lib/price-lookup-service.js";
import { logger } from "../lib/logger.js";

const router = Router();
const LOOKUP_TTL_MS = 30 * 60 * 1000;
const MAX_LOOKUPS = 200;
type Method = "tcgplayer" | "cardmarket" | "average";
type StoredLookup = { ownerId: string; expires: number; comparison: PriceComparison };
const lookups = new Map<string, StoredLookup>();

function text(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function number(value: string | null | undefined): string {
  return text(value?.split("/")[0]).replace(/^0+(?=\d)/, "");
}

export function matchesLookupCard(
  card: { catalogCardId: string | null; name: string; setName: string | null; cardNumber: string | null },
  printing: PriceComparison["card"],
): boolean {
  if (card.catalogCardId === printing.id) return true;
  // Catalog namespaces differ. Allow only a complete exact identity, never a name-only match.
  return !!text(card.name) && !!text(card.setName) && !!number(card.cardNumber)
    && text(card.name) === text(printing.name)
    && text(card.setName) === text(printing.setName)
    && number(card.cardNumber) === number(printing.cardNumber);
}

export function snapshotValue(comparison: PriceComparison, method: Method): number | null {
  const quotes = comparison.quotes.filter(quote =>
    quote.eligible && quote.status === "available" && quote.source !== "ebay"
    && quote.finish === comparison.finish && quote.valueUsd != null
    && Number.isFinite(quote.valueUsd) && quote.valueUsd >= 0);
  const distinct = [...new Map(quotes.map(quote => [quote.source, quote])).values()];
  const value = method === "average"
    ? distinct.length ? distinct.reduce((sum, quote) => sum + quote.valueUsd!, 0) / distinct.length : null
    : distinct.find(quote => quote.source === method)?.valueUsd ?? null;
  return value != null && value <= 99_999_999.99 ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

router.get("/pricing/lookup", requireAuth, async (req, res) => {
  const parsed = GetPricingLookupQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: "Choose a valid card printing and finish." }); return; }
  res.setHeader("Cache-Control", "no-store");
  try {
    const comparison = await lookupCardPrices(parsed.data.catalogCardId, parsed.data.finish);
    const now = Date.now();
    for (const [key, entry] of lookups) if (entry.expires <= now) lookups.delete(key);
    const lookupId = randomUUID();
    const expires = now + LOOKUP_TTL_MS;
    lookups.set(lookupId, { ownerId: (req as AuthRequest).userId, comparison, expires });
    while (lookups.size > MAX_LOOKUPS) lookups.delete(lookups.keys().next().value!);
    res.json({
      ...comparison, lookupId, observedAt: new Date(now).toISOString(), expiresAt: new Date(expires).toISOString(),
    });
  } catch (error) {
    logger.warn({ err: error }, "Card value lookup unavailable");
    res.status(503).json({ error: "This exact printing is temporarily unavailable. Try another catalog result or retry." });
  }
});

router.post("/cards/:cardId/value-snapshot", requireAuth, async (req, res) => {
  const cardId = Number(req.params.cardId);
  const parsed = SaveCardValueSnapshotBody.strict().safeParse(req.body);
  if (!Number.isSafeInteger(cardId) || cardId < 1 || !parsed.success) {
    res.status(400).json({ error: "Choose a card and an available price option." }); return;
  }
  const ownerId = (req as AuthRequest).userId;
  const lookup = lookups.get(parsed.data.lookupId);
  if (!lookup || lookup.ownerId !== ownerId || lookup.expires <= Date.now()) {
    res.status(409).json({ error: "This price lookup expired. Refresh prices before saving." }); return;
  }
  const value = snapshotValue(lookup.comparison, parsed.data.method);
  if (value == null) { res.status(400).json({ error: "This source cannot provide a comparable USD price for the selected finish." }); return; }
  const contributors = parsed.data.method === "average"
    ? lookup.comparison.quotes.filter(quote => quote.eligible && quote.source !== "ebay").map(quote => quote.source).join("+")
    : parsed.data.method;
  const source = `snapshot:${parsed.data.method}:${contributors}:${lookup.comparison.finish}${lookup.comparison.fx ? `:EURUSD=${lookup.comparison.fx.eurToUsd}@${lookup.comparison.fx.date}` : ""}`;
  const recordedAt = new Date();
  const outcome = await db.transaction(async tx => {
    const [card] = await tx.select().from(cardsTable)
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, ownerId))).for("update");
    if (!card) return "not_found" as const;
    if (!matchesLookupCard(card, lookup.comparison.card)) return "mismatch" as const;
    await tx.update(cardsTable).set({ estimatedValue: value.toFixed(2), updatedAt: recordedAt })
      .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, ownerId)));
    await tx.insert(cardPriceHistoryTable).values({ cardId, price: value.toFixed(2), source, recordedAt });
    return "saved" as const;
  });
  if (outcome === "not_found") { res.status(404).json({ error: "Owned card not found." }); return; }
  if (outcome === "mismatch") { res.status(409).json({ error: "This price is for a different printing. Search for your exact card." }); return; }
  res.json({ cardId, value, currency: "USD", method: parsed.data.method, source, recordedAt: recordedAt.toISOString() });
});

export default router;