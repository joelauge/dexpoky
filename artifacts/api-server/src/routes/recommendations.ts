import { Router } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, activityEventsTable, cardsTable, deckCardsTable, decksTable, wishlistItemsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { recommendCard, type RecommendationProfile } from "../lib/jev-recommendations.js";

const router = Router();
const profiles = new Set<RecommendationProfile>(["collector", "player", "seller", "trader", "investor"]);

async function facts(userId: string, cardIds?: number[]) {
  const cardConditions = [eq(cardsTable.ownerClerkId, userId)];
  if (cardIds?.length) cardConditions.push(inArray(cardsTable.id, cardIds));
  const cards = await db.select().from(cardsTable).where(and(...cardConditions)).limit(100);
  if (!cards.length) return [];
  const ids = cards.map((card) => card.id);
  const [allCards, deckRows, wishlistRows] = await Promise.all([
    db.select({ catalogCardId: cardsTable.catalogCardId }).from(cardsTable).where(eq(cardsTable.ownerClerkId, userId)),
    db.select({ cardId: deckCardsTable.cardId }).from(deckCardsTable).innerJoin(decksTable, eq(decksTable.id, deckCardsTable.deckId)).where(and(eq(decksTable.ownerClerkId, userId), inArray(deckCardsTable.cardId, ids))),
    db.select({ catalogCardId: wishlistItemsTable.catalogCardId }).from(wishlistItemsTable).where(eq(wishlistItemsTable.ownerClerkId, userId)),
  ]);
  const duplicateCounts = new Map<string, number>();
  for (const row of allCards) if (row.catalogCardId) duplicateCounts.set(row.catalogCardId, (duplicateCounts.get(row.catalogCardId) ?? 0) + 1);
  const deckUses = new Map<number, number>();
  for (const row of deckRows) if (row.cardId != null) deckUses.set(row.cardId, (deckUses.get(row.cardId) ?? 0) + 1);
  const wanted = new Set(wishlistRows.map((row) => row.catalogCardId));
  return cards.map((card) => ({
    card: {
      id: card.id, name: card.name, catalogCardId: card.catalogCardId,
      estimatedValue: card.estimatedValue == null ? null : Number(card.estimatedValue),
      listingPrice: card.listingPrice == null ? null : Number(card.listingPrice), evidenceAt: card.updatedAt,
      condition: card.condition, forSale: card.forSale, imageUrl: card.imageUrl,
    },
    duplicateCount: card.catalogCardId ? (duplicateCounts.get(card.catalogCardId) ?? 1) : 1,
    deckUses: deckUses.get(card.id) ?? 0,
    wishlistMatch: !!card.catalogCardId && wanted.has(card.catalogCardId),
  }));
}

function candidatePriority(row: Awaited<ReturnType<typeof facts>>[number]): number {
  const valueSignal = Math.min((row.card.estimatedValue ?? 0) / 100, 2);
  return (row.duplicateCount > 1 ? 3 : 0)
    + (row.deckUses > 0 ? 2 : 0)
    + (row.wishlistMatch ? 1 : 0)
    + valueSignal;
}

function profile(value: unknown): RecommendationProfile {
  return typeof value === "string" && profiles.has(value as RecommendationProfile) ? value as RecommendationProfile : "collector";
}

async function dismissedKeys(userId: string): Promise<Set<string>> {
  const feedback = await db
    .select({ metadata: activityEventsTable.metadata })
    .from(activityEventsTable)
    .where(and(
      eq(activityEventsTable.clerkId, userId),
      eq(activityEventsTable.type, "recommendation_feedback"),
    ));
  return new Set(
    feedback
      .map((row) => {
        const metadata = row.metadata as { recommendationKey?: string; value?: string } | null;
        return metadata?.value === "dismissed" ? metadata.recommendationKey : null;
      })
      .filter((key): key is string => Boolean(key)),
  );
}

router.get("/recommendations/opportunities", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const rows = (await facts(userId))
    .sort((a, b) => candidatePriority(b) - candidatePriority(a))
    .slice(0, 5);
  const selected = profile(req.query.profile);
  const dismissed = await dismissedKeys(userId);
  const recommendations = await Promise.all(rows.map((row) => recommendCard(row, selected, userId)));
  const opportunities = recommendations
    .map((result) => {
      const recommendation = result.recommendations.find((item) => !dismissed.has(item.key));
      return recommendation ? { ...recommendation, card: result.card } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence))
    .slice(0, 5);
  res.json({ profile: selected, opportunities, informational: true });
});

router.get("/cards/:id/recommendations", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const cardId = Number(req.params.id);
  if (!Number.isSafeInteger(cardId) || cardId <= 0) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }
  const rows = await facts(userId, [cardId]);
  if (!rows.length) { res.status(404).json({ error: "Owned card not found" }); return; }
  const [result, dismissed] = await Promise.all([
    recommendCard(rows[0], profile(req.query.profile), userId),
    dismissedKeys(userId),
  ]);
  res.json({
    ...result,
    recommendations: result.recommendations.filter((item) => !dismissed.has(item.key)),
  });
});

router.post("/recommendations/:key/feedback", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const value = req.body?.value;
  if (!["dismissed", "helpful", "not_helpful"].includes(value)) { res.status(400).json({ error: "value must be dismissed, helpful, or not_helpful" }); return; }
  const match = String(req.params.key).match(/^card:(\d+):(keep|play|sell|trade|grade|watch)$/);
  if (!match) { res.status(400).json({ error: "Invalid recommendation key" }); return; }
  const owned = await facts(userId, [Number(match[1])]);
  if (!owned.length) { res.status(404).json({ error: "Owned card not found" }); return; }
  await db.insert(activityEventsTable).values({ type: "recommendation_feedback", clerkId: userId, metadata: { recommendationKey: req.params.key, value } });
  res.status(201).json({ saved: true, recommendationKey: req.params.key, value });
});

export default router;