import { Router } from "express";
import { db, dmThreadsTable, tradeOffersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod";
import type { OfferHistoryEntry } from "@workspace/db";

const router = Router();

const UpdateOfferBody = z.object({
  action: z.enum([
    "schedule_video",
    "cancel_video",
    "accept",
    "decline",
    "counter",
    "set_exchange",
    "schedule_meetup",
    "cancel_meetup",
  ]),
  scheduledAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  amount: z.number().positive().optional(),
  method: z.enum(["store", "psa_vault", "courtyard_nft", "paypal_gs", "escrow_com", "cash_in_person"]).optional(),
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

  const { action, scheduledAt, notes, amount, method, location } = parsed.data;
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
      res.status(403).json({ error: "Waiting for seller to respond to your counter" });
      return;
    }
    updates.status = "accepted";
  } else if (action === "decline") {
    updates.status = "declined";
  } else if (action === "counter") {
    if (!amount) { res.status(400).json({ error: "amount required for counter" }); return; }
    if (existing.status === "accepted") {
      res.status(400).json({ error: "Offer already accepted" });
      return;
    }
    const fromRole: "buyer" | "seller" = isBuyer ? "buyer" : "seller";
    const newEntry: OfferHistoryEntry = {
      amount,
      from: fromRole,
      sentAt: now.toISOString(),
      note: notes,
    };
    updates.offerAmount = String(amount);
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
