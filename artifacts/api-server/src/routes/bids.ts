import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { listingsTable, auctionBidsTable, cardsTable, activityEventsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

const PlaceBidBody = z.object({
  amount: z.number().positive(),
  maxAmount: z.number().positive().optional(),
});

const AUTO_EXTEND_MINUTES = 5;

router.get("/marketplace/:id/bids", async (req, res) => {
  const listingId = Number(req.params.id);
  if (isNaN(listingId)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }
  const bids = await db
    .select({
      id: auctionBidsTable.id,
      listingId: auctionBidsTable.listingId,
      bidderClerkId: auctionBidsTable.bidderClerkId,
      amount: auctionBidsTable.amount,
      createdAt: auctionBidsTable.createdAt,
    })
    .from(auctionBidsTable)
    .where(eq(auctionBidsTable.listingId, listingId))
    .orderBy(desc(auctionBidsTable.createdAt));

  res.json(bids.map(b => ({
    ...b,
    amount: parseFloat(String(b.amount)),
  })));
});

router.post("/marketplace/:id/bids", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const listingId = Number(req.params.id);
  if (isNaN(listingId)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const parsed = PlaceBidBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error });
    return;
  }
  const { amount, maxAmount } = parsed.data;

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (listing.listingType !== "auction") {
    res.status(400).json({ error: "This listing is not an auction" });
    return;
  }

  if (listing.status !== "active") {
    res.status(400).json({ error: "Auction is not active" });
    return;
  }

  if (listing.auctionEndTime && new Date() > new Date(listing.auctionEndTime)) {
    res.status(400).json({ error: "Auction has ended" });
    return;
  }

  if (listing.sellerClerkId === userId) {
    res.status(400).json({ error: "Cannot bid on your own listing" });
    return;
  }

  const currentBid = listing.currentBid ? parseFloat(String(listing.currentBid)) : 0;
  const startingBid = listing.startingBid ? parseFloat(String(listing.startingBid)) : 0;
  const minIncrement = listing.minBidIncrement ? parseFloat(String(listing.minBidIncrement)) : 1;
  const minAllowed = currentBid > 0 ? currentBid + minIncrement : startingBid;

  if (amount < minAllowed) {
    res.status(400).json({ error: `Minimum bid is $${minAllowed.toFixed(2)}` });
    return;
  }

  let winningAmount = amount;
  let winnerClerkId = userId;

  if (listing.currentBidderClerkId && listing.currentBidderClerkId !== userId) {
    const existingProxyBid = await db
      .select()
      .from(auctionBidsTable)
      .where(eq(auctionBidsTable.listingId, listingId))
      .orderBy(desc(auctionBidsTable.createdAt))
      .limit(50);

    const currentBidderMaxBid = existingProxyBid
      .filter(b => b.bidderClerkId === listing.currentBidderClerkId && b.maxAmount)
      .reduce<number | null>((max, b) => {
        const bmax = parseFloat(String(b.maxAmount));
        return max === null ? bmax : Math.max(max, bmax);
      }, null);

    if (currentBidderMaxBid !== null) {
      const newBidderMax = maxAmount ?? amount;
      if (currentBidderMaxBid >= newBidderMax) {
        winningAmount = Math.min(currentBidderMaxBid, newBidderMax + minIncrement);
        winnerClerkId = listing.currentBidderClerkId;
      } else {
        winningAmount = Math.min(newBidderMax, currentBidderMaxBid + minIncrement);
        winnerClerkId = userId;
      }
    }
  }

  await db.insert(auctionBidsTable).values({
    listingId,
    bidderClerkId: userId,
    amount: String(amount),
    maxAmount: maxAmount ? String(maxAmount) : null,
  });

  let newEndTime = listing.auctionEndTime;
  if (listing.auctionEndTime) {
    const endTime = new Date(listing.auctionEndTime);
    const now = new Date();
    const msUntilEnd = endTime.getTime() - now.getTime();
    if (msUntilEnd < AUTO_EXTEND_MINUTES * 60 * 1000) {
      newEndTime = new Date(endTime.getTime() + AUTO_EXTEND_MINUTES * 60 * 1000);
    }
  }

  const [updatedListing] = await db
    .update(listingsTable)
    .set({
      currentBid: String(winningAmount),
      currentBidderClerkId: winnerClerkId,
      auctionEndTime: newEndTime,
      updatedAt: new Date(),
    })
    .where(eq(listingsTable.id, listingId))
    .returning();

  const [card] = await db
    .select({ name: cardsTable.name, imageUrl: cardsTable.imageUrl })
    .from(cardsTable)
    .where(eq(cardsTable.id, listing.cardId));

  await db.insert(activityEventsTable).values({
    type: "bid_placed",
    clerkId: userId,
    cardId: listing.cardId,
    listingId,
    metadata: {
      name: card?.name ?? null,
      imageUrl: card?.imageUrl ?? null,
      amount,
      winningAmount,
    },
  });

  res.status(201).json({
    ...updatedListing,
    currentBid: parseFloat(String(updatedListing.currentBid)),
    winnerClerkId,
    extended: newEndTime !== listing.auctionEndTime,
  });
});

export default router;
