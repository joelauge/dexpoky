import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { ratingsTable, listingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

const CreateRatingBody = z.object({
  ratedClerkId: z.string(),
  listingId: z.number().int().positive(),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
  type: z.enum(["buyer_to_seller", "seller_to_buyer"]),
});

router.get("/ratings/user/:clerkId", async (req, res) => {
  const { clerkId } = req.params;
  const ratings = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.ratedClerkId, clerkId))
    .orderBy(ratingsTable.createdAt);
  res.json(ratings);
});

router.post("/ratings", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateRatingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const { ratedClerkId, listingId, score, comment, type } = parsed.data;

  if (userId === ratedClerkId) {
    res.status(400).json({ error: "Cannot rate yourself" });
    return;
  }

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

  const existingRating = await db
    .select()
    .from(ratingsTable)
    .where(
      and(
        eq(ratingsTable.raterClerkId, userId),
        eq(ratingsTable.listingId, listingId),
        eq(ratingsTable.type, type),
      )
    )
    .limit(1);

  if (existingRating.length > 0) {
    res.status(409).json({ error: "Already rated this transaction" });
    return;
  }

  const [rating] = await db
    .insert(ratingsTable)
    .values({
      raterClerkId: userId,
      ratedClerkId,
      listingId,
      score,
      comment: comment ?? null,
      type,
    })
    .returning();

  res.status(201).json(rating);
});

export default router;
