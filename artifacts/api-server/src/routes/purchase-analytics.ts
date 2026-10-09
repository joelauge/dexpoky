import { Router } from "express";
import { and, eq } from "drizzle-orm";
import {
  db, activityEventsTable, agentRunsTable, dexAgentsTable, tradePaymentsTable, tradeOffersTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { purchaseReceipt } from "../lib/purchase-analytics.js";

const router = Router();

// Recovery on reload/reconnect works from durable settlements, never URL flags
// or seller notifications. Only the buyer can obtain a purchase receipt.
router.get("/analytics/purchases", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  // Reuse the server-only secret; never expose it or an unkeyed fallback.
  // It must remain stable across deploys to preserve GA4 sale-key deduplication.
  const signingKey = process.env.SESSION_SECRET;
  if (!signingKey) {
    res.status(503).json({ error: "Purchase analytics is not configured" });
    return;
  }
  const buyer = (req as AuthRequest).userId;
  const [trades, listings, agents] = await Promise.all([
    db.select({ id: tradePaymentsTable.tradeOfferId, cents: tradePaymentsTable.amountCents })
      .from(tradePaymentsTable)
      .innerJoin(tradeOffersTable, eq(tradeOffersTable.id, tradePaymentsTable.tradeOfferId))
      .where(and(eq(tradePaymentsTable.payerClerkId, buyer),
        eq(tradePaymentsTable.status, "completed"), eq(tradeOffersTable.status, "paid"))),
    db.select({ id: activityEventsTable.listingId, metadata: activityEventsTable.metadata })
      .from(activityEventsTable)
      .where(and(eq(activityEventsTable.clerkId, buyer), eq(activityEventsTable.type, "listing_sold"))),
    db.select({ id: agentRunsTable.listingId, amount: agentRunsTable.amountPathUsd })
      .from(agentRunsTable)
      .innerJoin(dexAgentsTable, eq(dexAgentsTable.id, agentRunsTable.agentId))
      .where(and(eq(agentRunsTable.clerkId, buyer), eq(agentRunsTable.status, "success"),
        eq(dexAgentsTable.agentRole, "buyer"))),
  ]);
  const receipts = [
    ...trades.map(t => purchaseReceipt("trade", t.id, t.cents, "USD", "inbox", signingKey)),
    ...listings.map(l => {
      const meta = l.metadata as { amountCents?: unknown; currency?: unknown } | null;
      // Legacy asking-price records are NOT authoritative paid amounts.
      return purchaseReceipt("listing", l.id, meta?.amountCents, meta?.currency, "marketplace", signingKey);
    }),
    // Despite the legacy PathUsd column name, executePurchase settles these
    // successful buyer runs by debiting the USD wallet in integer cents.
    ...agents.map(a => purchaseReceipt("listing", a.id,
      a.amount == null ? null : Math.round(Number(a.amount) * 100), "USD", "dex_agent", signingKey)),
  ].filter(r => r !== null);
  res.json([...new Map(receipts.map(r => [r.transaction_id, r])).values()]);
});

export default router;
