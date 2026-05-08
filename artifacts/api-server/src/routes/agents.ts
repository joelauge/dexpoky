import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  tempoWalletsTable,
  dexAgentsTable,
  agentRunsTable,
  agentApprovalRequestsTable,
  listingsTable,
  cardsTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  generateTempoWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  getPathUsdBalance,
  getAllTokenBalances,
  sendPathUsd,
  TEMPO_FAUCET_URL,
  TEMPO_EXPLORER_URL,
} from "../lib/tempoWallet.js";
import { notifyAgentPurchase } from "../lib/notifyAgentPurchase.js";
import { sendAgentApprovalSms, sendAgentAutoBuySms } from "../lib/agent-sms.js";
import { getOnrampCredentials } from "../stripeClient.js";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();

// ── Wallet ───────────────────────────────────────────────────────────────────

router.get("/agents/wallet", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;

  let wallet = await db
    .select()
    .from(tempoWalletsTable)
    .where(eq(tempoWalletsTable.clerkId, clerkId))
    .then((r) => r[0] ?? null);

  if (!wallet) {
    const { address, privateKey } = generateTempoWallet();
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    const [created] = await db
      .insert(tempoWalletsTable)
      .values({ clerkId, address, encryptedPrivateKey })
      .returning();
    wallet = created;
  }

  const [balance, tokens] = await Promise.all([
    getPathUsdBalance(wallet.address),
    getAllTokenBalances(wallet.address),
  ]);

  res.json({
    address: wallet.address,
    network: "Tempo Testnet",
    token: "pathUSD",
    balance,
    tokens,
    faucetUrl: TEMPO_FAUCET_URL,
    explorerUrl: `${TEMPO_EXPLORER_URL}/address/${wallet.address}`,
    createdAt: wallet.createdAt,
  });
});

// ── Stripe Crypto Onramp Session (fiat → Tempo pathUSD) ───────────────────────

router.post("/agents/tempo-onramp-session", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;

  let wallet = await db
    .select()
    .from(tempoWalletsTable)
    .where(eq(tempoWalletsTable.clerkId, clerkId))
    .then((r) => r[0] ?? null);

  if (!wallet) {
    const { address, privateKey } = generateTempoWallet();
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    const [created] = await db
      .insert(tempoWalletsTable)
      .values({ clerkId, address, encryptedPrivateKey })
      .returning();
    wallet = created;
  }

  let secretKey: string;
  let publishableKey: string;
  try {
    ({ secretKey, publishableKey } = await getOnrampCredentials());
  } catch {
    res.status(400).json({ error: "Stripe publishable key not available. Ensure the Stripe integration is connected." });
    return;
  }

  const body = new URLSearchParams({
    destination_network: "tempo",
    "destination_networks[]": "tempo",
    destination_currency: "pathusd",
    "destination_currencies[]": "pathusd",
    [`wallet_addresses[tempo]`]: wallet.address,
    lock_wallet_address: "true",
    source_currency: "usd",
  });

  const stripeResp = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2026-03-25.dahlia",
    },
    body: body.toString(),
  });

  if (!stripeResp.ok) {
    const errText = await stripeResp.text();
    req.log.error({ status: stripeResp.status, errText }, "Stripe onramp session creation failed");
    res.status(500).json({ error: "Failed to create onramp session" });
    return;
  }

  const session = (await stripeResp.json()) as { client_secret: string };
  res.json({ clientSecret: session.client_secret, publishableKey });
});

// ── Agents CRUD ───────────────────────────────────────────────────────────────

const createBuyerAgentSchema = z.object({
  agentRole: z.literal("buyer"),
  name: z.string().min(1).max(100),
  pokemonName: z.string().min(1).max(100),
  targetSetName: z.string().max(150).optional(),
  triggerType: z.enum(["buy_now", "bid"]).default("buy_now"),
  maxPricePathUsd: z.coerce.number().positive().max(10000),
  budgetPathUsd: z.coerce.number().positive().max(100000),
  requireHoloOnly: z.boolean().default(false),
  requireCondition: z.string().optional(),
  requireApproval: z.boolean().default(false),
});

const createSellerAgentSchema = z.object({
  agentRole: z.literal("seller"),
  name: z.string().min(1).max(100),
  cardId: z.coerce.number().int().positive(),
  floorPricePathUsd: z.coerce.number().positive().max(100000),
});

const createAgentSchema = z.discriminatedUnion("agentRole", [
  createBuyerAgentSchema,
  createSellerAgentSchema,
]);

router.get("/agents", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const agents = await db
    .select()
    .from(dexAgentsTable)
    .where(eq(dexAgentsTable.clerkId, clerkId))
    .orderBy(desc(dexAgentsTable.createdAt));
  res.json(agents);
});

router.post("/agents", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const parsed = createAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  if (parsed.data.agentRole === "buyer") {
    const { name, pokemonName, targetSetName, triggerType, maxPricePathUsd, budgetPathUsd, requireHoloOnly, requireCondition, requireApproval } = parsed.data;
    const [agent] = await db
      .insert(dexAgentsTable)
      .values({
        clerkId,
        agentRole: "buyer",
        name,
        pokemonName,
        targetSetName: targetSetName ?? null,
        triggerType,
        maxPricePathUsd: maxPricePathUsd.toString(),
        budgetPathUsd: budgetPathUsd.toString(),
        requireHoloOnly,
        requireCondition: requireCondition ?? null,
        requireApproval,
        status: "active",
      })
      .returning();
    res.status(201).json(agent);
    return;
  }

  // seller agent
  const { name, cardId, floorPricePathUsd } = parsed.data;

  // verify the card belongs to this user
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(eq(cardsTable.id, cardId), eq(cardsTable.ownerClerkId, clerkId)));

  if (!card) {
    res.status(404).json({ error: "Card not found in your inventory" });
    return;
  }

  const [agent] = await db
    .insert(dexAgentsTable)
    .values({
      clerkId,
      agentRole: "seller",
      name,
      cardId,
      floorPricePathUsd: floorPricePathUsd.toString(),
      status: "active",
    })
    .returning();

  res.status(201).json(agent);
});

router.patch("/agents/:id", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid agent id" }); return; }

  const patchSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(["active", "paused"]).optional(),
    // buyer fields
    pokemonName: z.string().min(1).max(200).optional(),
    targetSetName: z.string().max(200).optional(),   // empty string clears it
    maxPricePathUsd: z.coerce.number().positive().optional(),
    budgetPathUsd: z.coerce.number().positive().optional(),
    requireHoloOnly: z.boolean().optional(),
    requireApproval: z.boolean().optional(),
    // seller fields
    floorPricePathUsd: z.coerce.number().positive().optional(),
  });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", issues: parsed.error.issues });
    return;
  }

  const [existing] = await db
    .select()
    .from(dexAgentsTable)
    .where(and(eq(dexAgentsTable.id, id), eq(dexAgentsTable.clerkId, clerkId)));

  if (!existing) { res.status(404).json({ error: "Agent not found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) updates.name = parsed.data.name;
  if (parsed.data.status !== undefined) updates.status = parsed.data.status;
  if (parsed.data.pokemonName !== undefined) updates.pokemonName = parsed.data.pokemonName;
  if (parsed.data.targetSetName !== undefined) updates.targetSetName = parsed.data.targetSetName || null;
  if (parsed.data.maxPricePathUsd !== undefined) updates.maxPricePathUsd = parsed.data.maxPricePathUsd.toString();
  if (parsed.data.budgetPathUsd !== undefined) updates.budgetPathUsd = parsed.data.budgetPathUsd.toString();
  if (parsed.data.requireHoloOnly !== undefined) updates.requireHoloOnly = parsed.data.requireHoloOnly;
  if (parsed.data.requireApproval !== undefined) updates.requireApproval = parsed.data.requireApproval;
  if (parsed.data.floorPricePathUsd !== undefined) {
    updates.floorPricePathUsd = parsed.data.floorPricePathUsd.toString();
    // also update the active managed listing price so the change takes effect immediately
    if (existing.managedListingId) {
      await db
        .update(listingsTable)
        .set({ price: parsed.data.floorPricePathUsd.toFixed(2), updatedAt: new Date() })
        .where(and(eq(listingsTable.id, existing.managedListingId), eq(listingsTable.status, "active")));
    }
  }

  const [updated] = await db
    .update(dexAgentsTable)
    .set(updates)
    .where(eq(dexAgentsTable.id, id))
    .returning();

  res.json(updated);
});

router.delete("/agents/:id", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid agent id" }); return; }

  const [existing] = await db
    .select()
    .from(dexAgentsTable)
    .where(and(eq(dexAgentsTable.id, id), eq(dexAgentsTable.clerkId, clerkId)));

  if (!existing) { res.status(404).json({ error: "Agent not found" }); return; }

  // if seller agent had a managed listing, cancel it
  if (existing.managedListingId) {
    await db
      .update(listingsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(and(
        eq(listingsTable.id, existing.managedListingId),
        eq(listingsTable.status, "active"),
      ));
  }

  await db.delete(dexAgentsTable).where(eq(dexAgentsTable.id, id));
  res.status(204).end();
});

// ── Agent Runs ────────────────────────────────────────────────────────────────

router.get("/agents/runs", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const agentId = req.query.agentId ? Number(req.query.agentId) : undefined;
  const limit = Math.min(Number(req.query.limit ?? 10), 100);
  const offset = Math.max(Number(req.query.offset ?? 0), 0);

  const conditions = [eq(agentRunsTable.clerkId, clerkId)];
  if (agentId) conditions.push(eq(agentRunsTable.agentId, agentId));

  const runs = await db
    .select()
    .from(agentRunsTable)
    .where(and(...conditions))
    .orderBy(desc(agentRunsTable.createdAt))
    .limit(limit + 1)   // fetch one extra to determine hasMore
    .offset(offset);

  const hasMore = runs.length > limit;
  res.json({ runs: hasMore ? runs.slice(0, limit) : runs, hasMore });
});

// ── Manual trigger ────────────────────────────────────────────────────────────

router.post("/agents/:id/trigger", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid agent id" }); return; }

  const [agent] = await db
    .select()
    .from(dexAgentsTable)
    .where(and(eq(dexAgentsTable.id, id), eq(dexAgentsTable.clerkId, clerkId)));

  if (!agent) { res.status(404).json({ error: "Agent not found" }); return; }
  if (agent.status !== "active") { res.status(400).json({ error: "Agent is not active" }); return; }

  const result = await runAgentOnce(agent, clerkId);
  res.json(result);
});

// ── Inventory endpoint for seller agent card picker ───────────────────────────

router.get("/agents/inventory", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const { cardGradingCertsTable } = await import("@workspace/db");

  const cards = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      pokemonName: cardsTable.pokemonName,
      setName: cardsTable.setName,
      rarity: cardsTable.rarity,
      condition: cardsTable.condition,
      estimatedValue: cardsTable.estimatedValue,
      imageUrl: cardsTable.imageUrl,
      certId: cardGradingCertsTable.id,
      certStatus: cardGradingCertsTable.status,
      certCompany: cardGradingCertsTable.gradingCompany,
      certGrade: cardGradingCertsTable.grade,
      certNumber: cardGradingCertsTable.certNumber,
    })
    .from(cardsTable)
    .leftJoin(cardGradingCertsTable, eq(cardGradingCertsTable.cardId, cardsTable.id))
    .where(eq(cardsTable.ownerClerkId, clerkId))
    .orderBy(
      sql`case when ${cardGradingCertsTable.status} = 'verified' then 0 else 1 end`,
      cardsTable.name,
    )
    .limit(200);
  res.json(cards);
});

// ── Agent Execution Logic ─────────────────────────────────────────────────────

export type AgentRunResult = {
  matched: boolean;
  pendingApproval?: boolean;
  listingId?: number;
  cardName?: string;
  pricePathUsd?: string;
  txHash?: string;
  note: string;
};

export async function runAgentOnce(
  agent: typeof dexAgentsTable.$inferSelect,
  clerkId: string,
): Promise<AgentRunResult> {
  if (agent.agentRole === "seller") {
    return runSellerAgentOnce(agent, clerkId);
  }
  return runBuyerAgentOnce(agent, clerkId);
}

// ── Shared purchase executor ──────────────────────────────────────────────────

async function executePurchase(
  agent: typeof dexAgentsTable.$inferSelect,
  listing: typeof listingsTable.$inferSelect,
  card: typeof cardsTable.$inferSelect,
  wallet: typeof tempoWalletsTable.$inferSelect,
  clerkId: string,
): Promise<{ txHash?: string; status: string; note: string }> {
  const priceFloat = parseFloat(listing.price.toString());
  let txHash: string | undefined;
  let status = "simulated";
  let note = `Testnet simulation — would buy "${card.name}" for ${priceFloat.toFixed(6)} pathUSD`;

  try {
    const sellerWallet = await db
      .select()
      .from(tempoWalletsTable)
      .where(eq(tempoWalletsTable.clerkId, listing.sellerClerkId ?? ""))
      .then((r) => r[0] ?? null);

    const toAddress = sellerWallet?.address ?? "0x000000000000000000000000000000000000dead";
    const privateKey = decryptPrivateKey(wallet.encryptedPrivateKey);
    txHash = await sendPathUsd(privateKey, toAddress, priceFloat.toFixed(6));
    status = "success";
    note = `Bought "${card.name}" for ${priceFloat.toFixed(6)} pathUSD on Tempo Testnet`;

    await db.update(dexAgentsTable).set({
      spentPathUsd: sql`${dexAgentsTable.spentPathUsd}::numeric + ${priceFloat}`,
      lastRunAt: new Date(),
      runsCount: sql`${dexAgentsTable.runsCount} + 1`,
      updatedAt: new Date(),
    }).where(eq(dexAgentsTable.id, agent.id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    status = "simulated";
    note = `Testnet tx failed (${msg.slice(0, 80)}) — recording as simulated`;
    await db.update(dexAgentsTable).set({ lastRunAt: new Date(), runsCount: sql`${dexAgentsTable.runsCount} + 1` }).where(eq(dexAgentsTable.id, agent.id));
  }

  // Mark listing sold and transfer card ownership
  const acquiredAt = new Date();
  await Promise.all([
    db.update(listingsTable).set({ status: "sold" }).where(eq(listingsTable.id, listing.id)),
    db.update(cardsTable).set({ ownerClerkId: clerkId, agentAcquiredAt: acquiredAt }).where(eq(cardsTable.id, card.id)),
  ]);

  await db.insert(agentRunsTable).values({
    agentId: agent.id, clerkId,
    listingId: listing.id,
    cardName: card.name,
    amountPathUsd: priceFloat.toFixed(6),
    tempoTxHash: txHash,
    status, note,
  });

  void notifyAgentPurchase({
    buyerClerkId: clerkId,
    sellerClerkId: listing.sellerClerkId ?? clerkId,
    agentName: agent.name,
    cardName: card.name,
    cardId: card.id,
    cardImageUrl: card.imageUrl ?? undefined,
    pricePathUsd: priceFloat.toFixed(6),
    listingId: listing.id,
    txHash,
  });

  return { txHash, status, note };
}

// ── Buyer Agent ───────────────────────────────────────────────────────────────

async function runBuyerAgentOnce(
  agent: typeof dexAgentsTable.$inferSelect,
  clerkId: string,
): Promise<AgentRunResult> {
  const remaining = parseFloat(agent.budgetPathUsd) - parseFloat(agent.spentPathUsd);
  if (remaining <= 0) {
    await db.update(dexAgentsTable).set({ status: "budget_exhausted" }).where(eq(dexAgentsTable.id, agent.id));
    await db.insert(agentRunsTable).values({ status: "skipped", note: "Budget exhausted", agentId: agent.id, clerkId });
    return { matched: false, note: "Budget exhausted" };
  }

  const wallet = await db
    .select()
    .from(tempoWalletsTable)
    .where(eq(tempoWalletsTable.clerkId, clerkId))
    .then((r) => r[0] ?? null);

  if (!wallet) return { matched: false, note: "No Tempo wallet found" };

  const maxPrice = parseFloat(agent.maxPricePathUsd);
  const affordableMax = Math.min(maxPrice, remaining);

  const nameFilter = sql`lower(${cardsTable.name}) like lower(${"%" + agent.pokemonName + "%"})`;
  const setFilter = agent.targetSetName
    ? sql`lower(coalesce(${cardsTable.setName}, '')) like lower(${"%" + agent.targetSetName + "%"})`
    : sql`true`;

  const listings = await db
    .select({ listing: listingsTable, card: cardsTable })
    .from(listingsTable)
    .innerJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.listingType, "buy_now"),
      nameFilter,
      setFilter,
      sql`${listingsTable.price}::numeric <= ${affordableMax}`,
      sql`${listingsTable.sellerClerkId} != ${clerkId}`,
    ))
    .orderBy(sql`${listingsTable.price}::numeric asc`)
    .limit(1);

  if (listings.length === 0) {
    const note = `No buy-now listings for "${agent.pokemonName}" under ${affordableMax.toFixed(2)} pathUSD`;
    await db.insert(agentRunsTable).values({ status: "no_match", note, agentId: agent.id, clerkId });
    await db.update(dexAgentsTable).set({ lastRunAt: new Date(), runsCount: sql`${dexAgentsTable.runsCount} + 1` }).where(eq(dexAgentsTable.id, agent.id));
    return { matched: false, note };
  }

  const { listing, card } = listings[0];
  const priceFloat = parseFloat(listing.price.toString());

  // ── SMS approval flow ─────────────────────────────────────────────────────
  if (agent.requireApproval) {
    const [user] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId));

    if (user?.phone) {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const [approvalReq] = await db
        .insert(agentApprovalRequestsTable)
        .values({
          agentId: agent.id,
          clerkId,
          listingId: listing.id,
          cardName: card.name,
          pricePathUsd: priceFloat.toFixed(6),
          status: "pending",
          expiresAt,
        })
        .returning();

      try {
        await sendAgentApprovalSms({
          toPhone: user.phone,
          agentName: agent.name,
          cardName: card.name,
          pricePathUsd: priceFloat.toFixed(2),
        });
      } catch {
        // SMS send failure — cancel the approval request and fall through to auto-buy
        await db.update(agentApprovalRequestsTable)
          .set({ status: "rejected" })
          .where(eq(agentApprovalRequestsTable.id, approvalReq.id));
      }

      await db.insert(agentRunsTable).values({
        agentId: agent.id, clerkId,
        listingId: listing.id,
        cardName: card.name,
        amountPathUsd: priceFloat.toFixed(6),
        status: "pending_approval",
        note: `SMS approval requested — "${card.name}" for ${priceFloat.toFixed(2)} pathUSD`,
      });
      await db.update(dexAgentsTable).set({ lastRunAt: new Date(), runsCount: sql`${dexAgentsTable.runsCount} + 1` }).where(eq(dexAgentsTable.id, agent.id));

      return {
        matched: true,
        pendingApproval: true,
        listingId: listing.id,
        cardName: card.name,
        pricePathUsd: priceFloat.toFixed(2),
        note: "SMS approval sent — reply YES to confirm purchase",
      };
    }
    // No phone on file — fall through to auto-buy but note the skip
  }

  // ── Auto-purchase ─────────────────────────────────────────────────────────
  const { note } = await executePurchase(agent, listing, card, wallet, clerkId);

  // Send auto-buy FYI SMS if user has a phone and approval was NOT required
  if (!agent.requireApproval) {
    const [user] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.clerkId, clerkId));
    if (user?.phone) {
      void sendAgentAutoBuySms({
        toPhone: user.phone,
        agentName: agent.name,
        cardName: card.name,
        pricePathUsd: priceFloat.toFixed(2),
      });
    }
  }

  return { matched: true, listingId: listing.id, cardName: card.name, pricePathUsd: priceFloat.toFixed(6), note };
}

// ── Twilio SMS webhook (YES/NO approval replies) ───────────────────────────────

router.post("/agents/sms-webhook", async (req: Request, res: Response) => {
  const twiml = (msg: string) =>
    res.type("text/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Message></Response>`
    );

  const from = (req.body?.From as string ?? "").trim();
  const bodyText = (req.body?.Body as string ?? "").trim().toUpperCase();

  if (!from) { twiml("Unknown sender."); return; }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, from));

  if (!user) {
    twiml("We couldn't find a DexPoky account linked to this number. Add your phone number in Profile settings.");
    return;
  }

  const [approval] = await db
    .select()
    .from(agentApprovalRequestsTable)
    .where(and(
      eq(agentApprovalRequestsTable.clerkId, user.clerkId),
      eq(agentApprovalRequestsTable.status, "pending"),
      sql`${agentApprovalRequestsTable.expiresAt} > NOW()`,
    ))
    .orderBy(desc(agentApprovalRequestsTable.createdAt))
    .limit(1);

  if (!approval) {
    twiml("No pending purchase requests found. Your agent is still watching.");
    return;
  }

  if (bodyText.startsWith("YES") || bodyText === "Y") {
    // Mark approved first to prevent double-buys if they text YES twice
    await db.update(agentApprovalRequestsTable)
      .set({ status: "approved" })
      .where(eq(agentApprovalRequestsTable.id, approval.id));

    const [agent] = await db.select().from(dexAgentsTable).where(eq(dexAgentsTable.id, approval.agentId));
    if (!agent) { twiml("Agent not found — it may have been deleted."); return; }

    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, approval.listingId!));
    if (!listing || listing.status !== "active") {
      await db.update(agentApprovalRequestsTable).set({ status: "rejected" }).where(eq(agentApprovalRequestsTable.id, approval.id));
      twiml(`Sorry, the listing for ${approval.cardName ?? "this card"} is no longer available.`);
      return;
    }

    const [card] = await db.select().from(cardsTable).where(eq(cardsTable.id, listing.cardId!));
    if (!card) { twiml("Card record not found."); return; }

    const wallet = await db.select().from(tempoWalletsTable).where(eq(tempoWalletsTable.clerkId, user.clerkId)).then((r) => r[0] ?? null);
    if (!wallet) { twiml("No Tempo wallet found for your account."); return; }

    void executePurchase(agent, listing, card, wallet, user.clerkId);

    twiml(`Purchasing ${approval.cardName ?? "the card"} for ${parseFloat(approval.pricePathUsd ?? "0").toFixed(2)} pathUSD now! Check your DexPoky collection shortly.`);
  } else if (bodyText.startsWith("NO") || bodyText === "N") {
    await db.update(agentApprovalRequestsTable)
      .set({ status: "rejected" })
      .where(eq(agentApprovalRequestsTable.id, approval.id));
    twiml(`Purchase cancelled. Your DexAgent will continue watching for ${approval.cardName ?? "your card"}.`);
  } else {
    twiml(`Reply YES to buy ${approval.cardName ?? "the card"} for ${parseFloat(approval.pricePathUsd ?? "0").toFixed(2)} pathUSD, or NO to skip.`);
  }
});

// ── Seller Agent ──────────────────────────────────────────────────────────────

async function runSellerAgentOnce(
  agent: typeof dexAgentsTable.$inferSelect,
  clerkId: string,
): Promise<AgentRunResult> {
  if (!agent.cardId || !agent.floorPricePathUsd) {
    return { matched: false, note: "Seller agent missing card or floor price" };
  }

  const floor = parseFloat(agent.floorPricePathUsd);

  // check if we already have a managed listing
  if (agent.managedListingId) {
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, agent.managedListingId));

    if (listing?.status === "sold") {
      // listing sold — record success and mark agent completed
      const note = `Card sold for ${floor.toFixed(2)} pathUSD`;
      await db.insert(agentRunsTable).values({
        agentId: agent.id, clerkId,
        listingId: listing.id,
        amountPathUsd: floor.toFixed(6),
        status: "success",
        note,
      });
      await db.update(dexAgentsTable).set({
        status: "completed",
        lastRunAt: new Date(),
        runsCount: sql`${dexAgentsTable.runsCount} + 1`,
        updatedAt: new Date(),
      }).where(eq(dexAgentsTable.id, agent.id));
      return { matched: true, listingId: listing.id, pricePathUsd: floor.toFixed(6), note };
    }

    if (listing?.status === "active") {
      // still active — all good
      await db.update(dexAgentsTable).set({ lastRunAt: new Date(), runsCount: sql`${dexAgentsTable.runsCount} + 1` }).where(eq(dexAgentsTable.id, agent.id));
      return { matched: false, note: "Listing active — waiting for a buyer" };
    }

    // listing cancelled or missing — re-create it
  }

  // verify the card still belongs to this user
  const [card] = await db
    .select()
    .from(cardsTable)
    .where(and(eq(cardsTable.id, agent.cardId), eq(cardsTable.ownerClerkId, clerkId)));

  if (!card) {
    const note = "Card no longer in your inventory";
    await db.insert(agentRunsTable).values({ agentId: agent.id, clerkId, status: "skipped", note });
    await db.update(dexAgentsTable).set({ status: "paused", lastRunAt: new Date(), updatedAt: new Date() }).where(eq(dexAgentsTable.id, agent.id));
    return { matched: false, note };
  }

  // create a buy-now listing at the floor price
  const [listing] = await db
    .insert(listingsTable)
    .values({
      cardId: card.id,
      sellerClerkId: clerkId,
      listingType: "buy_now",
      price: floor.toFixed(2),
      description: `Listed by DexAgent "${agent.name}"`,
      status: "active",
    })
    .returning();

  await db.update(dexAgentsTable).set({
    managedListingId: listing.id,
    lastRunAt: new Date(),
    runsCount: sql`${dexAgentsTable.runsCount} + 1`,
    updatedAt: new Date(),
  }).where(eq(dexAgentsTable.id, agent.id));

  const note = `Listed "${card.name}" for ${floor.toFixed(2)} pathUSD`;
  await db.insert(agentRunsTable).values({ agentId: agent.id, clerkId, listingId: listing.id, cardName: card.name, amountPathUsd: floor.toFixed(6), status: "listed", note });

  return { matched: false, cardName: card.name, pricePathUsd: floor.toFixed(6), note };
}

export default router;
