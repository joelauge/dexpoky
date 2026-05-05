import { Router } from "express";
import { db, dmThreadsTable, tradeOffersTable, cardsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod";
import type { OfferHistoryEntry, OfferedCard } from "@workspace/db";

const router = Router();

const OfferedCardRef = z.object({ cardId: z.number().int().positive() });

const UpdateOfferBody = z.object({
  action: z.enum([
    "schedule_video",
    "cancel_video",
    "confirm_video",
    "accept",
    "decline",
    "counter",
    "set_exchange",
    "schedule_meetup",
    "cancel_meetup",
  ]),
  scheduledAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  amount: z.number().nonnegative().optional(),
  cards: z.array(OfferedCardRef).max(10).optional(),
  method: z.enum(["store", "psa_vault", "courtyard_nft", "paypal_gs", "escrow_com", "cash_in_person", "dexpoky_pay"]).optional(),
  location: z.string().max(300).optional(),
});

async function getThread(threadId: number, userId: string) {
  const [thread] = await db
    .select()
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.id, threadId));
  if (!thread) return null;
  if (thread.buyerClerkId !== userId && thread.sellerClerkId !== userId) return null;
  return thread;
}

function serializeOffer(offer: typeof tradeOffersTable.$inferSelect, role: "buyer" | "seller") {
  return {
    ...offer,
    askingPrice: offer.askingPrice != null ? parseFloat(String(offer.askingPrice)) : null,
    offerAmount: offer.offerAmount != null ? parseFloat(String(offer.offerAmount)) : null,
    offerHistory: (offer.offerHistory as OfferHistoryEntry[] | null) ?? [],
    role,
  };
}

router.get("/threads/:threadId/offer", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const userId = (req as AuthRequest).userId;
  const thread = await getThread(threadId, userId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  const [offer] = await db
    .select()
    .from(tradeOffersTable)
    .where(eq(tradeOffersTable.threadId, threadId));

  if (!offer) { res.json(null); return; }

  const role = thread.buyerClerkId === userId ? "buyer" : "seller";
  res.json(serializeOffer(offer, role));
});

router.patch("/threads/:threadId/offer", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const userId = (req as AuthRequest).userId;
  const thread = await getThread(threadId, userId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  const parsed = UpdateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { action, scheduledAt, notes, amount, cards: cardRefs, method, location } = parsed.data;
  const isBuyer = thread.buyerClerkId === userId;

  const [existing] = await db
    .select()
    .from(tradeOffersTable)
    .where(eq(tradeOffersTable.threadId, threadId));

  if (!existing) { res.status(404).json({ error: "No offer found for this thread" }); return; }

  const now = new Date();
  const updates: Partial<typeof tradeOffersTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: now,
  };

  const currentHistory: OfferHistoryEntry[] = (existing.offerHistory as OfferHistoryEntry[] | null) ?? [];

  if (action === "schedule_video") {
    if (!scheduledAt) { res.status(400).json({ error: "scheduledAt required" }); return; }
    updates.videoCallScheduledAt = new Date(scheduledAt);
    updates.videoCallNotes = notes ?? null;

  } else if (action === "cancel_video") {
    updates.videoCallScheduledAt = null;
    updates.videoCallNotes = null;
    updates.videoCallConfirmedByBuyer = false;
    updates.videoCallConfirmedBySeller = false;

  } else if (action === "confirm_video") {
    if (!existing.videoCallScheduledAt) {
      res.status(400).json({ error: "No video call scheduled" }); return;
    }
    if (isBuyer) {
      updates.videoCallConfirmedByBuyer = true;
    } else {
      updates.videoCallConfirmedBySeller = true;
    }

  } else if (action === "schedule_meetup") {
    if (!location) { res.status(400).json({ error: "location required" }); return; }
    updates.meetupLocation = location;
    updates.meetupProposedAt = now;
    updates.meetupNotes = notes ?? null;

  } else if (action === "cancel_meetup") {
    updates.meetupLocation = null;
    updates.meetupProposedAt = null;
    updates.meetupNotes = null;

  } else if (action === "accept") {
    if (existing.status === "pending" && !isBuyer) {
      res.status(403).json({ error: "Only buyer can accept the seller's asking price" });
      return;
    }
    if (existing.status === "countered" && isBuyer) {
      const lastEntry = currentHistory[currentHistory.length - 1];
      if (lastEntry?.from === "buyer") {
        res.status(403).json({ error: "Waiting for seller to respond to your counter" });
        return;
      }
    }
    updates.status = "accepted";

  } else if (action === "decline") {
    updates.status = "declined";

  } else if (action === "counter") {
    const cashAmount = amount ?? 0;

    // Must provide cash or cards
    if (cashAmount === 0 && (!cardRefs || cardRefs.length === 0)) {
      res.status(400).json({ error: "Provide a cash amount or at least one card to offer" });
      return;
    }
    if (existing.status === "accepted") {
      res.status(400).json({ error: "Offer already accepted" });
      return;
    }

    // Validate and snapshot offered cards
    let offeredCards: OfferedCard[] = [];
    if (cardRefs && cardRefs.length > 0) {
      const cardIds = cardRefs.map(c => c.cardId);
      const cardRows = await db
        .select({
          id: cardsTable.id,
          name: cardsTable.name,
          imageUrl: cardsTable.imageUrl,
          estimatedValue: cardsTable.estimatedValue,
          rarity: cardsTable.rarity,
          condition: cardsTable.condition,
          ownerClerkId: cardsTable.ownerClerkId,
        })
        .from(cardsTable)
        .where(inArray(cardsTable.id, cardIds));

      if (cardRows.length !== cardIds.length) {
        res.status(404).json({ error: "One or more cards were not found" });
        return;
      }

      const unauthorized = cardRows.filter(c => c.ownerClerkId !== userId);
      if (unauthorized.length > 0) {
        res.status(403).json({ error: "One or more cards do not belong to you" });
        return;
      }

      offeredCards = cardRows.map(c => ({
        cardId: c.id,
        cardName: c.name,
        imageUrl: c.imageUrl ?? null,
        estimatedValue: c.estimatedValue != null ? parseFloat(String(c.estimatedValue)) : null,
        rarity: c.rarity,
        condition: c.condition,
      }));
    }

    const fromRole: "buyer" | "seller" = isBuyer ? "buyer" : "seller";
    const newEntry: OfferHistoryEntry = {
      amount: cashAmount,
      cards: offeredCards.length > 0 ? offeredCards : undefined,
      from: fromRole,
      sentAt: now.toISOString(),
      note: notes,
    };

    updates.offerAmount = String(cashAmount);
    updates.status = "countered";
    updates.offerHistory = [...currentHistory, newEntry];

  } else if (action === "set_exchange") {
    if (!method) { res.status(400).json({ error: "method required" }); return; }
    if (existing.status !== "accepted") {
      res.status(400).json({ error: "Must accept offer before choosing escrow method" });
      return;
    }
    updates.exchangeMethod = method;
  }

  const [updated] = await db
    .update(tradeOffersTable)
    .set(updates)
    .where(eq(tradeOffersTable.id, existing.id))
    .returning();

  const role = isBuyer ? "buyer" : "seller";
  res.json(serializeOffer(updated, role));
});

export default router;
