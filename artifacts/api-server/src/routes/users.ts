import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { usersTable, ratingsTable, auctionBidsTable, listingsTable, sellerPayoutsTable } from "@workspace/db";
import { eq, and, or, sql, desc, ne } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

const UpdateProfileBody = z.object({
  username: z.string().regex(USERNAME_RE, "Username must be 3–20 characters: letters, numbers, underscores only.").optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  sellerDetails: z.string().max(1000).optional(),
});

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const PayoutMethodBody = z.object({
  payoutMethod: z.enum(["paypal", "stripe", "bank"]),
  payoutDestination: z.string().min(3).max(200),
});

const PayoutRequestBody = z.object({
  amountCents: z.number().int().positive(),
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
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid body" });
    return;
  }
  const current = await getOrCreateUser(userId);
  const updates: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };

  if (parsed.data.username && parsed.data.username !== current.username) {
    const normalised = parsed.data.username.toLowerCase();
    const [taken] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(sql`lower(${usersTable.username}) = ${normalised}`, ne(usersTable.clerkId, userId)));
    if (taken) {
      res.status(409).json({ error: "That username is already taken. Please choose another." });
      return;
    }
    if (current.username && current.usernameChangedAt) {
      const msSinceChange = Date.now() - new Date(current.usernameChangedAt).getTime();
      if (msSinceChange < THIRTY_DAYS_MS) {
        const nextAllowedAt = new Date(new Date(current.usernameChangedAt).getTime() + THIRTY_DAYS_MS);
        res.status(429).json({
          error: `You can change your username again on ${nextAllowedAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
          nextAllowedAt: nextAllowedAt.toISOString(),
        });
        return;
      }
    }
    updates.usernameChangedAt = new Date();
  }

  const [updated] = await db
    .update(usersTable)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .set(updates as any)
    .where(eq(usersTable.clerkId, userId))
    .returning();
  res.json(updated);
});

router.get("/users/me/earnings", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const user = await getOrCreateUser(userId);
  const entries = await db
    .select()
    .from(sellerPayoutsTable)
    .where(eq(sellerPayoutsTable.sellerClerkId, userId))
    .orderBy(desc(sellerPayoutsTable.createdAt));

  let availableCents = 0;
  let pendingCents = 0;
  let lifetimeEarnedCents = 0;
  let lifetimePaidOutCents = 0;
  for (const e of entries) {
    if (e.kind === "sale_credit" && e.status === "completed") {
      availableCents += e.amountCents;
      lifetimeEarnedCents += e.amountCents;
    } else if (e.kind === "payout_request") {
      if (e.status === "pending" || e.status === "completed") {
        availableCents -= e.amountCents;
      }
      if (e.status === "pending") pendingCents += e.amountCents;
      if (e.status === "completed") lifetimePaidOutCents += e.amountCents;
    }
  }

  res.json({
    availableCents,
    pendingCents,
    lifetimeEarnedCents,
    lifetimePaidOutCents,
    payoutMethod: user.payoutMethod,
    payoutDestination: user.payoutDestination,
    entries: entries.map(e => ({
      id: e.id,
      kind: e.kind,
      amountCents: e.amountCents,
      status: e.status,
      listingId: e.listingId,
      payoutMethod: e.payoutMethod,
      payoutDestination: e.payoutDestination,
      note: e.note,
      createdAt: e.createdAt,
    })),
  });
});

router.put("/users/me/payout-method", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = PayoutMethodBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  await getOrCreateUser(userId);
  const [updated] = await db
    .update(usersTable)
    .set({
      payoutMethod: parsed.data.payoutMethod,
      payoutDestination: parsed.data.payoutDestination,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.clerkId, userId))
    .returning();
  res.json({
    payoutMethod: updated.payoutMethod,
    payoutDestination: updated.payoutDestination,
  });
});

router.post("/users/me/payouts/request", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = PayoutRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const user = await getOrCreateUser(userId);
  if (!user.payoutMethod || !user.payoutDestination) {
    res.status(400).json({ error: "Add a payout method before requesting a payout" });
    return;
  }

  const entries = await db
    .select()
    .from(sellerPayoutsTable)
    .where(eq(sellerPayoutsTable.sellerClerkId, userId));
  let availableCents = 0;
  for (const e of entries) {
    if (e.kind === "sale_credit" && e.status === "completed") availableCents += e.amountCents;
    else if (e.kind === "payout_request" && (e.status === "pending" || e.status === "completed")) {
      availableCents -= e.amountCents;
    }
  }
  if (parsed.data.amountCents > availableCents) {
    res.status(400).json({ error: "Requested amount exceeds available balance" });
    return;
  }

  const [entry] = await db
    .insert(sellerPayoutsTable)
    .values({
      sellerClerkId: userId,
      kind: "payout_request",
      amountCents: parsed.data.amountCents,
      status: "pending",
      payoutMethod: user.payoutMethod,
      payoutDestination: user.payoutDestination,
      note: `Payout request via ${user.payoutMethod}`,
    })
    .returning();

  res.status(201).json(entry);
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
