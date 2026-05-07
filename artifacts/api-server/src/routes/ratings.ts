import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { ratingsTable, listingsTable, tradeOffersTable, dmThreadsTable, usersTable } from "@workspace/db";
import { eq, and, isNull, gte, desc, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const ReplyBody = z.object({
  replyText: z.string().min(1).max(500),
});

const router = Router();

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

const SubScores = z.object({
  subCondition: z.number().int().min(1).max(5).optional(),
  subCommunication: z.number().int().min(1).max(5).optional(),
  subShipping: z.number().int().min(1).max(5).optional(),
  subValue: z.number().int().min(1).max(5).optional(),
});

const CreateListingRatingBody = z.object({
  listingId: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
}).merge(SubScores);

const CreateTradeRatingBody = z.object({
  tradeOfferId: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
}).merge(SubScores);

function computeSellerLevel(positiveCount: number): string {
  if (positiveCount >= 500) return "Top Rated";
  if (positiveCount >= 200) return "Platinum";
  if (positiveCount >= 50) return "Gold";
  if (positiveCount >= 10) return "Silver";
  if (positiveCount >= 1) return "Bronze";
  return "New";
}

router.get("/ratings/user/:clerkId", async (req, res) => {
  const { clerkId } = req.params;
  const { role, period, page } = req.query;

  const conditions = [eq(ratingsTable.ratedClerkId, clerkId)];

  if (role === "seller") conditions.push(eq(ratingsTable.type, "buyer_to_seller"));
  else if (role === "buyer") conditions.push(eq(ratingsTable.type, "seller_to_buyer"));

  if (period && period !== "all") {
    const months = period === "1m" ? 1 : period === "6m" ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    conditions.push(gte(ratingsTable.createdAt, cutoff));
  }

  const allRatings = await db
    .select()
    .from(ratingsTable)
    .where(and(...conditions))
    .orderBy(desc(ratingsTable.createdAt));

  const total = allRatings.length;
  const avgScore = total > 0 ? allRatings.reduce((s, r) => s + r.score, 0) / total : null;

  const subAvg = (field: "subCondition" | "subCommunication" | "subShipping" | "subValue") => {
    const vals = allRatings.map(r => r[field]).filter((v): v is number => v !== null);
    return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  const positiveCount = allRatings.filter(r => r.score >= 4).length;
  const neutralCount = allRatings.filter(r => r.score === 3).length;
  const negativeCount = allRatings.filter(r => r.score <= 2).length;
  const positivePercent = total > 0 ? Math.round((positiveCount / total) * 1000) / 10 : null;
  const sellerLevel = computeSellerLevel(positiveCount);

  const summary = {
    ratingCount: total,
    ratingAverage: avgScore,
    subConditionAvg: subAvg("subCondition"),
    subCommunicationAvg: subAvg("subCommunication"),
    subShippingAvg: subAvg("subShipping"),
    subValueAvg: subAvg("subValue"),
    positiveCount,
    neutralCount,
    negativeCount,
    positivePercent,
    sellerLevel,
  };

  if (page !== undefined) {
    const pageNum = Math.max(1, parseInt(String(page)) || 1);
    const pageSize = 10;
    const paginated = allRatings.slice((pageNum - 1) * pageSize, pageNum * pageSize);

    const raterIds = [...new Set(paginated.map(r => r.raterClerkId))];
    const raterUsers = raterIds.length > 0
      ? await db
          .select({ clerkId: usersTable.clerkId, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(inArray(usersTable.clerkId, raterIds))
      : [];
    const raterMap = Object.fromEntries(raterUsers.map(u => [u.clerkId, u]));

    const enriched = paginated.map(r => ({
      ...r,
      raterUsername: raterMap[r.raterClerkId]?.username ?? null,
      raterAvatarUrl: raterMap[r.raterClerkId]?.avatarUrl ?? null,
    }));

    res.json({ ...summary, ratings: enriched, total, page: pageNum, pageSize });
    return;
  }

  res.json({ ...summary, ratings: allRatings });
});

router.post("/ratings", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const body = req.body as Record<string, unknown>;

  // ── Trade offer rating path ─────────────────────────────────────────────
  if ("tradeOfferId" in body) {
    const parsed = CreateTradeRatingBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error });
      return;
    }
    const { tradeOfferId, score, comment, subCondition, subCommunication, subShipping, subValue } = parsed.data;

    // Fetch offer + thread in one join to verify participation
    const [row] = await db
      .select({
        offerStatus: tradeOffersTable.status,
        threadBuyerClerkId: dmThreadsTable.buyerClerkId,
        threadSellerClerkId: dmThreadsTable.sellerClerkId,
        updatedAt: tradeOffersTable.updatedAt,
      })
      .from(tradeOffersTable)
      .innerJoin(dmThreadsTable, eq(dmThreadsTable.id, tradeOffersTable.threadId))
      .where(eq(tradeOffersTable.id, tradeOfferId));

    if (!row) {
      res.status(404).json({ error: "Trade offer not found" });
      return;
    }

    if (row.offerStatus !== "paid") {
      res.status(400).json({ error: "Can only rate after a completed transaction" });
      return;
    }

    // Enforce 60-day feedback window
    if (row.updatedAt && Date.now() - row.updatedAt.getTime() > SIXTY_DAYS_MS) {
      res.status(400).json({ error: "Feedback period closed — ratings must be submitted within 60 days of the transaction." });
      return;
    }

    const { threadBuyerClerkId, threadSellerClerkId } = row;

    // Derive type and ratedClerkId from participant role — no client trust
    let ratingType: "buyer_to_seller" | "seller_to_buyer";
    let ratedClerkId: string;

    if (userId === threadBuyerClerkId) {
      ratingType = "buyer_to_seller";
      ratedClerkId = threadSellerClerkId;
    } else if (userId === threadSellerClerkId) {
      ratingType = "seller_to_buyer";
      ratedClerkId = threadBuyerClerkId;
    } else {
      res.status(403).json({ error: "You are not a participant in this trade" });
      return;
    }

    // One rating per rater per trade offer — type is server-derived so no type in check
    const [existingRating] = await db
      .select({ id: ratingsTable.id })
      .from(ratingsTable)
      .where(
        and(
          eq(ratingsTable.raterClerkId, userId),
          eq(ratingsTable.tradeOfferId, tradeOfferId),
          isNull(ratingsTable.listingId),
        )
      )
      .limit(1);

    if (existingRating) {
      res.status(409).json({ error: "Already rated this transaction" });
      return;
    }

    const [rating] = await db
      .insert(ratingsTable)
      .values({
        raterClerkId: userId,
        ratedClerkId,
        listingId: null,
        tradeOfferId,
        score,
        comment: comment ?? null,
        type: ratingType,
        subCondition: subCondition ?? null,
        subCommunication: subCommunication ?? null,
        subShipping: subShipping ?? null,
        subValue: subValue ?? null,
        transactionCompletedAt: row.updatedAt,
      })
      .returning();

    res.status(201).json(rating);
    return;
  }

  // ── Listing rating path ─────────────────────────────────────────────────
  const parsed = CreateListingRatingBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const { listingId, score, comment, subCondition, subCommunication, subShipping, subValue } = parsed.data;

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (listing.status !== "sold") {
    res.status(400).json({ error: "Can only rate after a completed transaction" });
    return;
  }

  // Enforce 60-day feedback window
  if (listing.updatedAt && Date.now() - listing.updatedAt.getTime() > SIXTY_DAYS_MS) {
    res.status(400).json({ error: "Feedback period closed — ratings must be submitted within 60 days of the transaction." });
    return;
  }

  // Determine buyer via the dm_threads linked to this listing
  const [thread] = await db
    .select({ buyerClerkId: dmThreadsTable.buyerClerkId, sellerClerkId: dmThreadsTable.sellerClerkId })
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.listingId, listingId))
    .limit(1);

  const sellerClerkId = listing.sellerClerkId ?? thread?.sellerClerkId;
  const buyerClerkId = thread?.buyerClerkId;

  let ratingType: "buyer_to_seller" | "seller_to_buyer";
  let ratedClerkId: string;

  if (sellerClerkId && userId === sellerClerkId && buyerClerkId) {
    ratingType = "seller_to_buyer";
    ratedClerkId = buyerClerkId;
  } else if (buyerClerkId && userId === buyerClerkId && sellerClerkId) {
    ratingType = "buyer_to_seller";
    ratedClerkId = sellerClerkId;
  } else {
    res.status(403).json({ error: "You are not a participant in this transaction" });
    return;
  }

  if (userId === ratedClerkId) {
    res.status(400).json({ error: "Cannot rate yourself" });
    return;
  }

  // One rating per rater per listing — type is server-derived
  const [existingRating] = await db
    .select({ id: ratingsTable.id })
    .from(ratingsTable)
    .where(
      and(
        eq(ratingsTable.raterClerkId, userId),
        eq(ratingsTable.listingId, listingId),
        isNull(ratingsTable.tradeOfferId),
      )
    )
    .limit(1);

  if (existingRating) {
    res.status(409).json({ error: "Already rated this transaction" });
    return;
  }

  const [rating] = await db
    .insert(ratingsTable)
    .values({
      raterClerkId: userId,
      ratedClerkId,
      listingId,
      tradeOfferId: null,
      score,
      comment: comment ?? null,
      type: ratingType,
      subCondition: subCondition ?? null,
      subCommunication: subCommunication ?? null,
      subShipping: subShipping ?? null,
      subValue: subValue ?? null,
      transactionCompletedAt: listing.updatedAt,
    })
    .returning();

  res.status(201).json(rating);
});

router.get("/ratings/offer/:offerId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const offerId = parseInt(String(req.params.offerId));
  if (isNaN(offerId)) { res.status(400).json({ error: "Invalid offer id" }); return; }

  const [rating] = await db
    .select()
    .from(ratingsTable)
    .where(
      and(
        eq(ratingsTable.tradeOfferId, offerId),
        eq(ratingsTable.raterClerkId, userId),
      )
    )
    .limit(1);

  if (!rating) { res.status(404).json({ error: "No rating found" }); return; }
  res.json(rating);
});

router.post("/ratings/:id/reply", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const ratingId = parseInt(String(req.params.id));
  if (isNaN(ratingId)) { res.status(400).json({ error: "Invalid rating id" }); return; }

  const parsed = ReplyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body", details: parsed.error }); return; }

  const [rating] = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.id, ratingId))
    .limit(1);

  if (!rating) { res.status(404).json({ error: "Rating not found" }); return; }
  if (rating.ratedClerkId !== userId) { res.status(403).json({ error: "Only the rated party can reply" }); return; }
  if (rating.replyText !== null) { res.status(409).json({ error: "A reply already exists" }); return; }

  const [updated] = await db
    .update(ratingsTable)
    .set({ replyText: parsed.data.replyText, repliedAt: new Date() })
    .where(eq(ratingsTable.id, ratingId))
    .returning();

  res.json(updated);
});

export default router;
