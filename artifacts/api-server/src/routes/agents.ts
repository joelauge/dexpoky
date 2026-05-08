import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  tempoWalletsTable,
  dexAgentsTable,
  agentRunsTable,
  listingsTable,
  cardsTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  generateTempoWallet,
  encryptPrivateKey,
  decryptPrivateKey,
  getPathUsdBalance,
  sendPathUsd,
  TEMPO_FAUCET_URL,
  TEMPO_EXPLORER_URL,
} from "../lib/tempoWallet.js";
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

  const balance = await getPathUsdBalance(wallet.address);

  res.json({
    address: wallet.address,
    network: "Tempo Testnet",
    token: "pathUSD",
    balance,
    faucetUrl: TEMPO_FAUCET_URL,
    explorerUrl: `${TEMPO_EXPLORER_URL}/address/${wallet.address}`,
    createdAt: wallet.createdAt,
  });
});

// ── Agents CRUD ───────────────────────────────────────────────────────────────

const createBuyerAgentSchema = z.object({
  agentRole: z.literal("buyer"),
  name: z.string().min(1).max(100),
  pokemonName: z.string().min(1).max(100),
  triggerType: z.enum(["buy_now", "bid"]).default("buy_now"),
  maxPricePathUsd: z.coerce.number().positive().max(10000),
  budgetPathUsd: z.coerce.number().positive().max(100000),
  requireHoloOnly: z.boolean().default(false),
  requireCondition: z.string().optional(),
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
    const { name, pokemonName, triggerType, maxPricePathUsd, budgetPathUsd, requireHoloOnly, requireCondition } = parsed.data;
    const [agent] = await db
      .insert(dexAgentsTable)
      .values({
        clerkId,
        agentRole: "buyer",
        name,
        pokemonName,
        triggerType,
        maxPricePathUsd: maxPricePathUsd.toString(),
        budgetPathUsd: budgetPathUsd.toString(),
        requireHoloOnly,
        requireCondition: requireCondition ?? null,
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
    maxPricePathUsd: z.coerce.number().positive().optional(),
    budgetPathUsd: z.coerce.number().positive().optional(),
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
  if (parsed.data.name) updates.name = parsed.data.name;
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.maxPricePathUsd) updates.maxPricePathUsd = parsed.data.maxPricePathUsd.toString();
  if (parsed.data.budgetPathUsd) updates.budgetPathUsd = parsed.data.budgetPathUsd.toString();
  if (parsed.data.floorPricePathUsd) updates.floorPricePathUsd = parsed.data.floorPricePathUsd.toString();

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

  const conditions = [eq(agentRunsTable.clerkId, clerkId)];
  if (agentId) conditions.push(eq(agentRunsTable.agentId, agentId));

  const runs = await db
    .select()
    .from(agentRunsTable)
    .where(and(...conditions))
    .orderBy(desc(agentRunsTable.createdAt))
    .limit(50);

  res.json(runs);
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
    })
    .from(cardsTable)
    .where(eq(cardsTable.ownerClerkId, clerkId))
    .orderBy(cardsTable.name)
    .limit(200);
  res.json(cards);
});

// ── Agent Execution Logic ─────────────────────────────────────────────────────

export type AgentRunResult = {
  matched: boolean;
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

  const listings = await db
    .select({ listing: listingsTable, card: cardsTable })
    .from(listingsTable)
    .innerJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
    .where(and(
      eq(listingsTable.status, "active"),
      eq(listingsTable.listingType, "buy_now"),
      sql`lower(${cardsTable.name}) like lower(${"%" + agent.pokemonName + "%"})`,
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

  await db.insert(agentRunsTable).values({
    agentId: agent.id, clerkId,
    listingId: listing.id,
    cardName: card.name,
    amountPathUsd: priceFloat.toFixed(6),
    tempoTxHash: txHash,
    status, note,
  });

  return { matched: true, listingId: listing.id, cardName: card.name, pricePathUsd: priceFloat.toFixed(6), txHash, note };
}

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
