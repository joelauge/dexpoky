import { Router } from "express";
import { sql, eq, desc } from "drizzle-orm";
import { db, usersTable, tradePaymentsTable, sellerPayoutsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { getUncachableStripeClient } from "../stripeClient.js";
import { stripeService } from "../stripeService.js";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();

const TOPUP_AMOUNTS_CENTS = [1000, 2500, 5000, 10000];

async function getOrEnsureUser(clerkId: string, email?: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId));
  if (user) return user;
  const [created] = await db
    .insert(usersTable)
    .values({ clerkId, email: email ?? null })
    .returning();
  return created;
}

router.get("/wallet/balance", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const user = await getOrEnsureUser(clerkId);

  const paid = await db
    .select()
    .from(tradePaymentsTable)
    .where(eq(tradePaymentsTable.payerClerkId, clerkId))
    .orderBy(desc(tradePaymentsTable.createdAt))
    .limit(20);

  const received = await db
    .select()
    .from(sellerPayoutsTable)
    .where(eq(sellerPayoutsTable.sellerClerkId, clerkId))
    .orderBy(desc(sellerPayoutsTable.createdAt))
    .limit(20);

  res.json({
    balanceCents: user.walletBalanceCents ?? 0,
    topupAmounts: TOPUP_AMOUNTS_CENTS,
    recentPayments: paid,
    recentCredits: received,
  });
});

const TopupBody = z.object({ amountCents: z.number().int().min(500).max(50000) });

router.post("/wallet/topup", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const parsed = TopupBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid amount" }); return; }

  const { amountCents } = parsed.data;

  const user = await getOrEnsureUser(clerkId);
  const email = user.email ?? `${clerkId}@dexpoky.user`;
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
          product_data: { name: "DexPoky Wallet Top-Up" },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${origin}/api/wallet/topup/confirm?session_id={CHECKOUT_SESSION_ID}&clerk_id=${clerkId}`,
    cancel_url: `${origin}/wallet`,
    metadata: { clerkId, amountCents: String(amountCents), type: "wallet_topup" },
  });

  res.json({ url: session.url });
});

router.get("/wallet/topup/confirm", async (req: Request, res: Response) => {
  const { session_id, clerk_id } = req.query as { session_id?: string; clerk_id?: string };
  if (!session_id || !clerk_id) {
    res.status(400).send("Missing params");
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== "paid") {
      res.redirect("/wallet?topup=failed");
      return;
    }

    const amountCents = parseInt(String(session.metadata?.amountCents ?? "0"), 10);
    if (!amountCents) { res.redirect("/wallet?topup=failed"); return; }

    await db
      .update(usersTable)
      .set({ walletBalanceCents: sql`${usersTable.walletBalanceCents} + ${amountCents}` })
      .where(eq(usersTable.clerkId, clerk_id));

    res.redirect(`/wallet?topup=ok&amount=${amountCents}`);
  } catch {
    res.redirect("/wallet?topup=failed");
  }
});

export default router;
