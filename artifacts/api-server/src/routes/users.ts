import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, ratingsTable, auctionBidsTable, listingsTable } from "@workspace/db";
import { eq, and, or, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

const UpdateProfileBody = z.object({
  username: z.string().min(2).max(40).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  sellerDetails: z.string().max(1000).optional(),
});

async function getOrCreateUser(clerkId: string) {
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (!user) {
    [user] = await db
      .insert(usersTable)
      .values({ clerkId })
      .returning();
  }
  return user;
}

async function getRatingSummary(clerkId: string) {
  const ratings = await db
    .select()
    .from(ratingsTable)
    .where(eq(ratingsTable.ratedClerkId, clerkId));
  const count = ratings.length;
  const avg = count > 0 ? ratings.reduce((s, r) => s + r.score, 0) / count : null;
  return { ratingCount: count, ratingAverage: avg };
}

router.get("/users/me", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const user = await getOrCreateUser(userId);
  const summary = await getRatingSummary(userId);
  res.json({ ...user, ...summary });
});

router.put("/users/me", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  await getOrCreateUser(userId);
  const [updated] = await db
    .update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.clerkId, userId))
    .returning();
  res.json(updated);
});

router.get("/users/:clerkId", async (req, res) => {
  const { clerkId } = req.params;
  const user = await getOrCreateUser(clerkId);
  const summary = await getRatingSummary(clerkId);

  const requesterAuth = getAuth(req as never);
  const requesterId = requesterAuth?.userId ?? null;

  let showSellerDetails = false;
  if (requesterId && requesterId !== clerkId) {
    const sellerListings = await db
      .select({ id: listingsTable.id })
      .from(listingsTable)
      .where(eq(listingsTable.sellerClerkId, clerkId));
    const listingIds = sellerListings.map(l => l.id);
    if (listingIds.length > 0) {
      const bid = await db
        .select()
        .from(auctionBidsTable)
        .where(
          and(
            eq(auctionBidsTable.bidderClerkId, requesterId),
            sql`${auctionBidsTable.listingId} = ANY(${JSON.stringify(listingIds)}::int[])`
          )
        )
        .limit(1);
      showSellerDetails = bid.length > 0;
    }
  }

  const publicUser = {
    clerkId: user.clerkId,
    username: user.username,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    sellerDetails: showSellerDetails ? user.sellerDetails : null,
    ...summary,
  };

  res.json(publicUser);
});

export default router;
