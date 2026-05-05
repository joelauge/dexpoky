import { Router } from "express";
import { db, dmThreadsTable, tradeOffersTable } from "@workspace/db";
import { eq, and, or } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod/v4";

const router = Router();

const UpdateOfferBody = z.object({
  action: z.enum(["schedule_video", "accept", "decline", "counter", "set_exchange"]),
  scheduledAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  amount: z.number().positive().optional(),
  method: z.enum(["store", "psa_vault", "courtyard_nft"]).optional(),
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

  res.json({
    ...offer,
    askingPrice: offer.askingPrice != null ? parseFloat(String(offer.askingPrice)) : null,
    offerAmount: offer.offerAmount != null ? parseFloat(String(offer.offerAmount)) : null,
    role: thread.buyerClerkId === userId ? "buyer" : "seller",
  });
});

router.patch("/threads/:threadId/offer", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const userId = (req as AuthRequest).userId;
  const thread = await getThread(threadId, userId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  const parsed = UpdateOfferBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid body" }); return; }

  const { action, scheduledAt, notes, amount, method } = parsed.data;

  const isBuyer = thread.buyerClerkId === userId;

  const [existing] = await db
    .select()
    .from(tradeOffersTable)
    .where(eq(tradeOffersTable.threadId, threadId));

  if (!existing) { res.status(404).json({ error: "No offer found for this thread" }); return; }

  const updates: Partial<typeof tradeOffersTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };

  if (action === "schedule_video") {
    if (!scheduledAt) { res.status(400).json({ error: "scheduledAt required" }); return; }
    updates.videoCallScheduledAt = new Date(scheduledAt);
    updates.videoCallNotes = notes ?? null;
  } else if (action === "accept") {
    if (!isBuyer && existing.status !== "countered") {
      res.status(403).json({ error: "Only buyer can accept the initial offer" });
      return;
    }
    updates.status = "accepted";
  } else if (action === "decline") {
    updates.status = "declined";
  } else if (action === "counter") {
    if (!amount) { res.status(400).json({ error: "amount required for counter" }); return; }
    updates.offerAmount = String(amount);
    updates.status = "countered";
  } else if (action === "set_exchange") {
    if (!method) { res.status(400).json({ error: "method required" }); return; }
    if (existing.status !== "accepted") {
      res.status(400).json({ error: "Must accept offer before choosing exchange method" });
      return;
    }
    updates.exchangeMethod = method;
  }

  const [updated] = await db
    .update(tradeOffersTable)
    .set(updates)
    .where(eq(tradeOffersTable.id, existing.id))
    .returning();

  res.json({
    ...updated,
    askingPrice: updated.askingPrice != null ? parseFloat(String(updated.askingPrice)) : null,
    offerAmount: updated.offerAmount != null ? parseFloat(String(updated.offerAmount)) : null,
    role: isBuyer ? "buyer" : "seller",
  });
});

export default router;
