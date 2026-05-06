import { Router } from "express";
import { createHmac, randomInt } from "crypto";
import { db, dmThreadsTable, tradeOffersTable, cardsTable, usersTable, tradePaymentsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { stripeService } from "../stripeService.js";
import { z } from "zod";
import type { Request, Response } from "express";
import type { OfferHistoryEntry, OfferedCard } from "@workspace/db";
import { notifyPaymentConfirmed } from "../lib/notifyNewMessage.js";

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
    "confirm_exchange",
    "reject_exchange",
    "schedule_meetup",
    "cancel_meetup",
    "confirm_store_meetup",
  ]),
  scheduledAt: z.string().optional(),
  notes: z.string().max(500).optional(),
  amount: z.number().nonnegative().optional(),
  cards: z.array(OfferedCardRef).max(10).optional(),
  method: z.enum(["store", "psa_vault", "courtyard_nft", "paypal_gs", "escrow_com", "cash_in_person", "dexpoky_pay"]).optional(),
  location: z.string().max(300).optional(),
  pin: z.string().length(6).optional(),
});

const PLATFORM_FEE_RATE = 0.03;

function agreedAmountCents(offer: typeof tradeOffersTable.$inferSelect): number {
  const raw = offer.offerAmount ?? offer.askingPrice;
  if (!raw) return 0;
  return Math.round(parseFloat(String(raw)) * 100);
}

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
  const now = new Date();
  const pinActive =
    !!offer.storeMeetupPinHash &&
    !!offer.storeMeetupPinExpiresAt &&
    offer.storeMeetupPinExpiresAt > now;

  const { storeMeetupPinHash: _hash, ...rest } = offer;
  return {
    ...rest,
    askingPrice: offer.askingPrice != null ? parseFloat(String(offer.askingPrice)) : null,
    offerAmount: offer.offerAmount != null ? parseFloat(String(offer.offerAmount)) : null,
    offerHistory: (offer.offerHistory as OfferHistoryEntry[] | null) ?? [],
    storeMeetupPinActive: pinActive,
    storeMeetupPinExpiresAt: pinActive ? offer.storeMeetupPinExpiresAt!.toISOString() : null,
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
    if (!isBuyer) {
      res.status(403).json({ error: "Only the buyer can propose a payment method" });
      return;
    }
    if (existing.status !== "accepted") {
      res.status(400).json({ error: "Must accept offer before choosing a payment method" });
      return;
    }
    updates.exchangeMethod = method;
    updates.exchangeMethodProposedBy = "buyer";
    updates.exchangeMethodConfirmedBySeller = false;

  } else if (action === "confirm_exchange") {
    if (isBuyer) {
      res.status(403).json({ error: "Only the seller can confirm the payment method" });
      return;
    }
    if (!existing.exchangeMethod) {
      res.status(400).json({ error: "No payment method has been proposed yet" });
      return;
    }
    if (existing.exchangeMethodConfirmedBySeller) {
      res.status(400).json({ error: "Payment method already confirmed" });
      return;
    }
    updates.exchangeMethodConfirmedBySeller = true;

  } else if (action === "reject_exchange") {
    if (isBuyer) {
      res.status(403).json({ error: "Only the seller can reject the payment method" });
      return;
    }
    if (!existing.exchangeMethod) {
      res.status(400).json({ error: "No payment method has been proposed" });
      return;
    }
    updates.exchangeMethod = null;
    updates.exchangeMethodProposedBy = null;
    updates.exchangeMethodConfirmedBySeller = false;

  } else if (action === "confirm_store_meetup") {
    if (!isBuyer) {
      res.status(403).json({ error: "Only the buyer can confirm in-person payment" }); return;
    }
    if (existing.status !== "accepted") {
      res.status(400).json({ error: "Offer is not accepted yet" }); return;
    }
    if (existing.exchangeMethod !== "store") {
      res.status(400).json({ error: "Exchange method is not Meet at Card Shop" }); return;
    }
    if (!existing.exchangeMethodConfirmedBySeller) {
      res.status(400).json({ error: "Method not confirmed by seller yet" }); return;
    }
    if (!parsed.data.pin) {
      res.status(400).json({ error: "PIN is required" }); return;
    }
    if (!existing.storeMeetupPinHash || !existing.storeMeetupPinExpiresAt) {
      res.status(400).json({ error: "No PIN has been generated yet — ask the seller to generate one" }); return;
    }
    if (new Date() > existing.storeMeetupPinExpiresAt) {
      res.status(400).json({ error: "PIN has expired — ask the seller to generate a new one" }); return;
    }

    const secret = process.env.SESSION_SECRET;
    if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }
    const expectedHash = createHmac("sha256", secret).update(parsed.data.pin).digest("hex");
    if (expectedHash !== existing.storeMeetupPinHash) {
      res.status(400).json({ error: "Incorrect PIN — double-check with the seller" }); return;
    }

    const amountCents = agreedAmountCents(existing);
    if (amountCents < 50) { res.status(400).json({ error: "Amount too small (min $0.50)" }); return; }

    const [buyer] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
    if (!buyer) { res.status(404).json({ error: "Buyer account not found" }); return; }

    const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
    const netCents = amountCents - feeCents;
    const payeeClerkId = thread.sellerClerkId;

    if ((buyer.walletBalanceCents ?? 0) >= amountCents) {
      // Wallet payment — do it in a transaction and return paid offer
      await db.transaction(async (tx) => {
        await tx.update(usersTable)
          .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} - ${amountCents}` })
          .where(eq(usersTable.clerkId, userId));

        await tx.insert(tradePaymentsTable).values({
          tradeOfferId: existing.id,
          payerClerkId: userId,
          payeeClerkId,
          amountCents,
          feeCents,
          status: "completed",
          paymentMethod: "wallet",
        });

        await tx.update(tradeOffersTable)
          .set({ status: "paid", storeMeetupPinHash: null, storeMeetupPinExpiresAt: null, updatedAt: new Date() })
          .where(eq(tradeOffersTable.id, existing.id));

        await tx.update(usersTable)
          .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${netCents}` })
          .where(eq(usersTable.clerkId, payeeClerkId));
      });

      const [paid] = await db.select().from(tradeOffersTable).where(eq(tradeOffersTable.id, existing.id));
      void notifyPaymentConfirmed({
        sellerClerkId: payeeClerkId,
        buyerClerkId: userId,
        threadId,
        amountCents,
      });
      res.json(serializeOffer(paid, "buyer"));
      return;
    } else {
      // Insufficient wallet — create Stripe session, clear PIN, return checkoutUrl
      const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));
      const email = user?.email ?? `${userId}@dexpoky.user`;
      const customerId = await stripeService.getOrCreateCustomer(userId, email);
      const stripe = await getUncachableStripeClient();
      const origin = `${(req as Request).protocol}://${(req as Request).get("host")}`;

      await db.update(tradeOffersTable)
        .set({ storeMeetupPinHash: null, storeMeetupPinExpiresAt: null, updatedAt: new Date() })
        .where(eq(tradeOffersTable.id, existing.id));

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `DexPoky In-Store Payment — Thread #${threadId}` },
            unit_amount: amountCents,
          },
          quantity: 1,
        }],
        mode: "payment",
        success_url: `${origin}/api/threads/${threadId}/payment/store-meetup/confirm?session_id={CHECKOUT_SESSION_ID}&clerk_id=${userId}`,
        cancel_url: `${origin}/inbox?thread=${threadId}`,
        metadata: {
          clerkId: userId,
          threadId: String(threadId),
          tradeOfferId: String(existing.id),
          amountCents: String(amountCents),
          payeeClerkId,
          type: "store_meetup_payment",
        },
      });

      res.json({ checkoutUrl: session.url });
      return;
    }
  }

  const [updated] = await db
    .update(tradeOffersTable)
    .set(updates)
    .where(eq(tradeOffersTable.id, existing.id))
    .returning();

  const role = isBuyer ? "buyer" : "seller";
  res.json(serializeOffer(updated, role));
});

router.post("/threads/:threadId/offer/store-pin", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const userId = (req as AuthRequest).userId;
  const thread = await getThread(threadId, userId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  if (thread.buyerClerkId === userId) {
    res.status(403).json({ error: "Only the seller can generate a PIN" }); return;
  }

  const [offer] = await db
    .select()
    .from(tradeOffersTable)
    .where(eq(tradeOffersTable.threadId, threadId));

  if (!offer) { res.status(404).json({ error: "No offer found" }); return; }
  if (offer.status !== "accepted") {
    res.status(400).json({ error: "Offer must be accepted before generating a PIN" }); return;
  }
  if (offer.exchangeMethod !== "store") {
    res.status(400).json({ error: "Exchange method must be Meet at Card Shop" }); return;
  }
  if (!offer.exchangeMethodConfirmedBySeller) {
    res.status(400).json({ error: "Exchange method not yet confirmed by seller" }); return;
  }

  const pin = String(randomInt(100000, 1000000));
  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }
  const hash = createHmac("sha256", secret).update(pin).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db
    .update(tradeOffersTable)
    .set({ storeMeetupPinHash: hash, storeMeetupPinExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(tradeOffersTable.id, offer.id));

  res.json({ pin, expiresAt: expiresAt.toISOString() });
});

export default router;
