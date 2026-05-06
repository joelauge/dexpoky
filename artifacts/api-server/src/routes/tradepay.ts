import { Router } from "express";
import { createHmac } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, usersTable, tradeOffersTable, dmThreadsTable, tradePaymentsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { stripeService } from "../stripeService.js";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();

const PLATFORM_FEE_RATE = 0.03;

async function resolveThread(threadId: number, userId: string) {
  const [thread] = await db.select().from(dmThreadsTable).where(eq(dmThreadsTable.id, threadId));
  if (!thread) return null;
  if (thread.buyerClerkId !== userId && thread.sellerClerkId !== userId) return null;
  return thread;
}

async function resolveOffer(threadId: number) {
  const [offer] = await db.select().from(tradeOffersTable).where(eq(tradeOffersTable.threadId, threadId));
  return offer ?? null;
}

async function getUser(clerkId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  return user ?? null;
}

function agreedAmountCents(offer: typeof tradeOffersTable.$inferSelect): number {
  const raw = offer.offerAmount ?? offer.askingPrice;
  if (!raw) return 0;
  return Math.round(parseFloat(String(raw)) * 100);
}

router.post("/threads/:threadId/payment/checkout", requireAuth, async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const clerkId = (req as AuthRequest).userId;
  const thread = await resolveThread(threadId, clerkId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  if (thread.buyerClerkId !== clerkId) {
    res.status(403).json({ error: "Only the buyer can initiate payment" });
    return;
  }

  const offer = await resolveOffer(threadId);
  if (!offer) { res.status(404).json({ error: "No offer for this thread" }); return; }
  if (offer.status !== "accepted") { res.status(400).json({ error: "Offer is not accepted yet" }); return; }
  if (offer.exchangeMethod !== "dexpoky_pay") { res.status(400).json({ error: "Exchange method is not dexpoky_pay" }); return; }

  const amountCents = agreedAmountCents(offer);
  if (amountCents < 50) { res.status(400).json({ error: "Amount too small (min $0.50)" }); return; }

  const user = await getUser(clerkId);
  const email = user?.email ?? `${clerkId}@dexpoky.user`;
  const customerId = await stripeService.getOrCreateCustomer(clerkId, email);

  const stripe = await getUncachableStripeClient();
  const origin = `${req.protocol}://${req.get("host")}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `DexPoky Trade Payment — Thread #${threadId}` },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${origin}/api/threads/${threadId}/payment/confirm?session_id={CHECKOUT_SESSION_ID}&clerk_id=${clerkId}`,
    cancel_url: `${origin}/inbox?thread=${threadId}`,
    metadata: {
      clerkId,
      threadId: String(threadId),
      tradeOfferId: String(offer.id),
      amountCents: String(amountCents),
      payeeClerkId: thread.sellerClerkId,
      type: "trade_payment",
    },
  });

  res.json({ url: session.url });
});

router.get("/threads/:threadId/payment/confirm", async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  const { session_id, clerk_id } = req.query as { session_id?: string; clerk_id?: string };

  if (isNaN(threadId) || !session_id || !clerk_id) {
    res.redirect(`/inbox?thread=${threadId}&pay=failed`);
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      res.redirect(`/inbox?thread=${threadId}&pay=failed`);
      return;
    }

    const meta = session.metadata ?? {};
    const tradeOfferId = parseInt(meta.tradeOfferId ?? "", 10);
    const amountCents = parseInt(meta.amountCents ?? "0", 10);
    const payeeClerkId = meta.payeeClerkId ?? "";

    if (!tradeOfferId || !amountCents || !payeeClerkId) {
      res.redirect(`/inbox?thread=${threadId}&pay=failed`);
      return;
    }

    const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
    const netCents = amountCents - feeCents;

    await db.transaction(async (tx) => {
      await tx.insert(tradePaymentsTable).values({
        tradeOfferId,
        payerClerkId: clerk_id,
        payeeClerkId,
        amountCents,
        feeCents,
        status: "completed",
        paymentMethod: "card",
        stripeSessionId: session_id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      });

      await tx.update(tradeOffersTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(tradeOffersTable.id, tradeOfferId));

      await tx.update(usersTable)
        .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${netCents}` })
        .where(eq(usersTable.clerkId, payeeClerkId));
    });

    res.redirect(`/inbox?thread=${threadId}&pay=ok`);
  } catch {
    res.redirect(`/inbox?thread=${threadId}&pay=failed`);
  }
});

const WalletPayBody = z.object({});

router.post("/threads/:threadId/payment/wallet", requireAuth, async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const clerkId = (req as AuthRequest).userId;
  const thread = await resolveThread(threadId, clerkId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  if (thread.buyerClerkId !== clerkId) {
    res.status(403).json({ error: "Only the buyer can initiate payment" });
    return;
  }

  const offer = await resolveOffer(threadId);
  if (!offer) { res.status(404).json({ error: "No offer for this thread" }); return; }
  if (offer.status !== "accepted") { res.status(400).json({ error: "Offer is not accepted yet" }); return; }
  if (offer.exchangeMethod !== "dexpoky_pay") { res.status(400).json({ error: "Exchange method is not dexpoky_pay" }); return; }

  const amountCents = agreedAmountCents(offer);
  if (amountCents < 50) { res.status(400).json({ error: "Amount too small" }); return; }

  const buyer = await getUser(clerkId);
  if (!buyer) { res.status(404).json({ error: "Buyer not found" }); return; }
  if ((buyer.walletBalanceCents ?? 0) < amountCents) {
    res.status(400).json({ error: "Insufficient wallet balance" });
    return;
  }

  const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  const netCents = amountCents - feeCents;
  const payeeClerkId = thread.sellerClerkId;

  await db.transaction(async (tx) => {
    await tx.update(usersTable)
      .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} - ${amountCents}` })
      .where(eq(usersTable.clerkId, clerkId));

    await tx.insert(tradePaymentsTable).values({
      tradeOfferId: offer.id,
      payerClerkId: clerkId,
      payeeClerkId,
      amountCents,
      feeCents,
      status: "completed",
      paymentMethod: "wallet",
    });

    await tx.update(tradeOffersTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(tradeOffersTable.id, offer.id));

    await tx.update(usersTable)
      .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${netCents}` })
      .where(eq(usersTable.clerkId, payeeClerkId));
  });

  res.json({ success: true, amountCents, feeCents, netCents });
});

router.get("/threads/:threadId/payment/status", requireAuth, async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const clerkId = (req as AuthRequest).userId;
  const thread = await resolveThread(threadId, clerkId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  const offer = await resolveOffer(threadId);
  if (!offer) { res.json({ paid: false }); return; }

  const [payment] = await db
    .select()
    .from(tradePaymentsTable)
    .where(eq(tradePaymentsTable.tradeOfferId, offer.id));

  res.json({
    paid: !!payment,
    payment: payment ?? null,
    offerStatus: offer.status,
  });
});

const StoreMeetupPayBody = z.object({ pin: z.string().min(6).max(6) });

router.post("/threads/:threadId/payment/store-meetup", requireAuth, async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) { res.status(400).json({ error: "Invalid threadId" }); return; }

  const clerkId = (req as AuthRequest).userId;
  const thread = await resolveThread(threadId, clerkId);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  if (thread.buyerClerkId !== clerkId) {
    res.status(403).json({ error: "Only the buyer can confirm in-person payment" }); return;
  }

  const parsed = StoreMeetupPayBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "PIN must be 6 digits" }); return; }

  const offer = await resolveOffer(threadId);
  if (!offer) { res.status(404).json({ error: "No offer for this thread" }); return; }
  if (offer.status !== "accepted") { res.status(400).json({ error: "Offer is not accepted yet" }); return; }
  if (offer.exchangeMethod !== "store") { res.status(400).json({ error: "Exchange method is not Meet at Card Shop" }); return; }
  if (!offer.exchangeMethodConfirmedBySeller) { res.status(400).json({ error: "Method not confirmed by seller yet" }); return; }

  if (!offer.storeMeetupPinHash || !offer.storeMeetupPinExpiresAt) {
    res.status(400).json({ error: "No PIN has been generated yet — ask the seller to generate one" }); return;
  }
  if (new Date() > offer.storeMeetupPinExpiresAt) {
    res.status(400).json({ error: "PIN has expired — ask the seller to generate a new one" }); return;
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) { res.status(500).json({ error: "Server misconfiguration: SESSION_SECRET not set" }); return; }
  const expectedHash = createHmac("sha256", secret).update(parsed.data.pin).digest("hex");
  if (expectedHash !== offer.storeMeetupPinHash) {
    res.status(400).json({ error: "Incorrect PIN — double-check with the seller" }); return;
  }

  const amountCents = agreedAmountCents(offer);
  if (amountCents < 50) { res.status(400).json({ error: "Amount too small (min $0.50)" }); return; }

  const buyer = await getUser(clerkId);
  if (!buyer) { res.status(404).json({ error: "Buyer account not found" }); return; }

  const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  const netCents = amountCents - feeCents;
  const payeeClerkId = thread.sellerClerkId;

  if ((buyer.walletBalanceCents ?? 0) >= amountCents) {
    await db.transaction(async (tx) => {
      await tx.update(usersTable)
        .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} - ${amountCents}` })
        .where(eq(usersTable.clerkId, clerkId));

      await tx.insert(tradePaymentsTable).values({
        tradeOfferId: offer.id,
        payerClerkId: clerkId,
        payeeClerkId,
        amountCents,
        feeCents,
        status: "completed",
        paymentMethod: "wallet",
      });

      await tx.update(tradeOffersTable)
        .set({ status: "paid", storeMeetupPinHash: null, storeMeetupPinExpiresAt: null, updatedAt: new Date() })
        .where(eq(tradeOffersTable.id, offer.id));

      await tx.update(usersTable)
        .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${netCents}` })
        .where(eq(usersTable.clerkId, payeeClerkId));
    });

    res.json({ success: true, method: "wallet", amountCents, feeCents, netCents });
  } else {
    const user = await getUser(clerkId);
    const email = user?.email ?? `${clerkId}@dexpoky.user`;
    const customerId = await stripeService.getOrCreateCustomer(clerkId, email);

    const stripe = await getUncachableStripeClient();
    const origin = `${req.protocol}://${req.get("host")}`;

    await db.update(tradeOffersTable)
      .set({ storeMeetupPinHash: null, storeMeetupPinExpiresAt: null, updatedAt: new Date() })
      .where(eq(tradeOffersTable.id, offer.id));

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
      success_url: `${origin}/api/threads/${threadId}/payment/store-meetup/confirm?session_id={CHECKOUT_SESSION_ID}&clerk_id=${clerkId}`,
      cancel_url: `${origin}/inbox?thread=${threadId}`,
      metadata: {
        clerkId,
        threadId: String(threadId),
        tradeOfferId: String(offer.id),
        amountCents: String(amountCents),
        payeeClerkId,
        type: "store_meetup_payment",
      },
    });

    res.json({ checkoutUrl: session.url });
  }
});

router.get("/threads/:threadId/payment/store-meetup/confirm", async (req: Request, res: Response) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  const { session_id, clerk_id } = req.query as { session_id?: string; clerk_id?: string };

  if (isNaN(threadId) || !session_id || !clerk_id) {
    res.redirect(`/inbox?thread=${threadId}&pay=failed`); return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      res.redirect(`/inbox?thread=${threadId}&pay=failed`); return;
    }

    const meta = session.metadata ?? {};
    const tradeOfferId = parseInt(meta.tradeOfferId ?? "", 10);
    const amountCents = parseInt(meta.amountCents ?? "0", 10);
    const payeeClerkId = meta.payeeClerkId ?? "";

    if (!tradeOfferId || !amountCents || !payeeClerkId) {
      res.redirect(`/inbox?thread=${threadId}&pay=failed`); return;
    }

    const feeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
    const netCents = amountCents - feeCents;

    await db.transaction(async (tx) => {
      await tx.insert(tradePaymentsTable).values({
        tradeOfferId,
        payerClerkId: clerk_id,
        payeeClerkId,
        amountCents,
        feeCents,
        status: "completed",
        paymentMethod: "card",
        stripeSessionId: session_id,
        stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      });

      await tx.update(tradeOffersTable)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(tradeOffersTable.id, tradeOfferId));

      await tx.update(usersTable)
        .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${netCents}` })
        .where(eq(usersTable.clerkId, payeeClerkId));
    });

    res.redirect(`/inbox?thread=${threadId}&pay=ok`);
  } catch {
    res.redirect(`/inbox?thread=${threadId}&pay=failed`);
  }
});

export default router;
