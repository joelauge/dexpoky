import { Router, type Request, type Response } from "express";
import { and, desc, eq, gt, isNull, lte, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  cardsTable,
  db,
  deckCardsTable,
  decksTable,
  listingsTable,
  wantedListingsTable,
} from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  createConfirmationToken,
  createContinuationToken,
  routeAssistantRequest,
  verifyConfirmationToken,
  verifyContinuationToken,
  type AssistantPlan,
  type AssistantRoutingContext,
} from "../lib/jev-dexpoky-assistant.js";

const router = Router();
const AssistantMessageBody = z.object({
  message: z.string().trim().min(2).max(1000),
  continuationToken: z.string().min(20).max(5000).optional(),
}).strict();
const AssistantConfirmBody = z.object({ confirmationToken: z.string().min(20).max(5000) }).strict();

const activeWanted = and(
  eq(wantedListingsTable.status, "active"),
  or(isNull(wantedListingsTable.expiresAt), gt(wantedListingsTable.expiresAt, sql`NOW()`)),
);

async function loadRoutingContext(userId: string): Promise<AssistantRoutingContext> {
  const [cards, wanted, decks, marketplacePokemon] = await Promise.all([
    db.select({
      id: cardsTable.id,
      name: cardsTable.name,
      pokemonName: cardsTable.pokemonName,
      setName: cardsTable.setName,
      cardNumber: cardsTable.cardNumber,
    }).from(cardsTable)
      .where(eq(cardsTable.ownerClerkId, userId))
      .orderBy(desc(cardsTable.updatedAt))
      .limit(100),
    db.select({
      id: wantedListingsTable.id,
      name: wantedListingsTable.name,
      pokemonName: wantedListingsTable.pokemonName,
      setName: wantedListingsTable.setName,
      maxPrice: wantedListingsTable.maxPrice,
      status: wantedListingsTable.status,
    }).from(wantedListingsTable)
      .where(eq(wantedListingsTable.ownerClerkId, userId))
      .orderBy(desc(wantedListingsTable.createdAt))
      .limit(100),
    db.select({
      id: decksTable.id,
      name: decksTable.name,
      description: decksTable.description,
    }).from(decksTable)
      .where(eq(decksTable.ownerClerkId, userId))
      .orderBy(desc(decksTable.updatedAt))
      .limit(100),
    db.selectDistinct({ pokemonName: cardsTable.pokemonName })
      .from(listingsTable)
      .innerJoin(cardsTable, eq(cardsTable.id, listingsTable.cardId))
      .where(eq(listingsTable.status, "active"))
      .orderBy(cardsTable.pokemonName)
      .limit(100),
  ]);
  return {
    cards: cards.map((card) => ({
      id: card.id,
      label: [card.name, card.setName, card.cardNumber ? `#${card.cardNumber}` : null].filter(Boolean).join(" — "),
      aliases: [card.pokemonName],
    })),
    wanted: wanted.map((item) => ({
      id: item.id,
      label: [
        item.name || item.pokemonName,
        item.setName,
        item.maxPrice == null ? "no budget" : `up to $${Number(item.maxPrice).toFixed(2)}`,
        item.status,
      ].filter(Boolean).join(" — "),
      aliases: [item.pokemonName],
    })),
    decks: decks.map((deck) => ({
      id: deck.id,
      label: deck.name,
      aliases: deck.description ? [deck.description] : [],
    })),
    marketplacePokemon: marketplacePokemon.map((row) => row.pokemonName).filter(Boolean),
  };
}

function wantedSummary(item: typeof wantedListingsTable.$inferSelect) {
  return {
    id: item.id,
    name: item.name,
    pokemonName: item.pokemonName,
    setName: item.setName,
    cardNumber: item.cardNumber,
    maxPrice: item.maxPrice == null ? null : Number(item.maxPrice),
    status: item.status,
    expiresAt: item.expiresAt?.toISOString() ?? null,
  };
}

async function executeReadPlan(userId: string, plan: AssistantPlan) {
  switch (plan.action) {
    case "find_duplicates": {
      const rows = await db.select({
        name: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        imageUrl: sql<string | null>`min(${cardsTable.imageUrl})`,
        count: sql<number>`count(*)::int`,
      }).from(cardsTable)
        .where(eq(cardsTable.ownerClerkId, userId))
        .groupBy(
          sql`lower(${cardsTable.name})`,
          sql`lower(coalesce(${cardsTable.pokemonName}, ''))`,
          sql`lower(coalesce(${cardsTable.setName}, ''))`,
          sql`lower(coalesce(${cardsTable.cardNumber}, ''))`,
          cardsTable.name,
          cardsTable.pokemonName,
          cardsTable.setName,
          cardsTable.cardNumber,
        )
        .having(sql`count(*) > 1`)
        .orderBy(desc(sql`count(*)`))
        .limit(30);
      return { summary: rows.length ? `I found ${rows.length} duplicate group${rows.length === 1 ? "" : "s"} in your collection.` : "I did not find any duplicates in your collection.", data: rows };
    }
    case "search_collection": {
      const [anchor] = await db.select().from(cardsTable).where(and(
        eq(cardsTable.id, plan.args.cardId),
        eq(cardsTable.ownerClerkId, userId),
      ));
      if (!anchor) return { summary: "That card is no longer in your collection.", data: [] };
      const rows = await db.select({
        id: cardsTable.id,
        name: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        rarity: cardsTable.rarity,
        condition: cardsTable.condition,
        estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
        imageUrl: cardsTable.imageUrl,
        forSale: cardsTable.forSale,
      }).from(cardsTable).where(and(
        eq(cardsTable.ownerClerkId, userId),
        sql`lower(${cardsTable.name}) = lower(${anchor.name})`,
      )).limit(30);
      return { summary: `I found ${rows.length} matching ${anchor.name} card${rows.length === 1 ? "" : "s"} in your collection.`, data: rows };
    }
    case "search_marketplace": {
      const rows = await db.select({
        listingId: listingsTable.id,
        listingType: listingsTable.listingType,
        price: sql<number>`${listingsTable.price}::float`,
        status: listingsTable.status,
        description: listingsTable.description,
        card: {
          id: cardsTable.id,
          name: cardsTable.name,
          pokemonName: cardsTable.pokemonName,
          setName: cardsTable.setName,
          cardNumber: cardsTable.cardNumber,
          rarity: cardsTable.rarity,
          condition: cardsTable.condition,
          imageUrl: cardsTable.imageUrl,
        },
      }).from(listingsTable)
        .innerJoin(cardsTable, eq(cardsTable.id, listingsTable.cardId))
        .where(and(
          eq(listingsTable.status, "active"),
          sql`lower(${cardsTable.pokemonName}) = lower(${plan.args.pokemonName})`,
        ))
        .orderBy(listingsTable.price)
        .limit(30);
      return { summary: rows.length ? `I found ${rows.length} active ${plan.args.pokemonName} listing${rows.length === 1 ? "" : "s"}.` : `I did not find an active ${plan.args.pokemonName} listing.`, data: rows };
    }
    case "find_trade_opportunities": {
      const rows = await db.select({
        cardId: cardsTable.id,
        cardName: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        imageUrl: cardsTable.imageUrl,
        wantedListingId: wantedListingsTable.id,
        wantedName: wantedListingsTable.name,
        maxPrice: sql<number | null>`${wantedListingsTable.maxPrice}::float`,
        ownerDisplayName: wantedListingsTable.ownerDisplayName,
      }).from(cardsTable)
        .innerJoin(wantedListingsTable, sql`lower(${wantedListingsTable.pokemonName}) = lower(${cardsTable.pokemonName})`)
        .where(and(
          eq(cardsTable.ownerClerkId, userId),
          activeWanted,
          eq(wantedListingsTable.isPublic, true),
          ne(wantedListingsTable.ownerClerkId, userId),
        ))
        .orderBy(desc(wantedListingsTable.createdAt))
        .limit(30);
      return { summary: rows.length ? `I found ${rows.length} possible trade opportunit${rows.length === 1 ? "y" : "ies"} from public Looking For requests.` : "I did not find a current public Looking For request matching your cards.", data: rows };
    }
    case "list_wanted": {
      const rows = await db.select().from(wantedListingsTable)
        .where(eq(wantedListingsTable.ownerClerkId, userId))
        .orderBy(desc(wantedListingsTable.createdAt))
        .limit(50);
      return { summary: `You have ${rows.length} Looking For request${rows.length === 1 ? "" : "s"}.`, data: rows.map(wantedSummary) };
    }
    case "inspect_wanted_matches": {
      const [wanted] = await db.select().from(wantedListingsTable).where(and(
        eq(wantedListingsTable.id, plan.args.wantedListingId),
        eq(wantedListingsTable.ownerClerkId, userId),
      ));
      if (!wanted) return { summary: "That Looking For request is no longer available.", data: [] };
      const filters = [
        eq(listingsTable.status, "active"),
        ne(listingsTable.sellerClerkId, userId),
        sql`lower(${cardsTable.pokemonName}) = lower(${wanted.pokemonName})`,
      ];
      if (wanted.maxPrice != null) filters.push(lte(listingsTable.price, wanted.maxPrice));
      const rows = await db.select({
        listingId: listingsTable.id,
        name: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        rarity: cardsTable.rarity,
        condition: cardsTable.condition,
        price: sql<number>`${listingsTable.price}::float`,
        imageUrl: cardsTable.imageUrl,
      }).from(listingsTable)
        .innerJoin(cardsTable, eq(cardsTable.id, listingsTable.cardId))
        .where(and(...filters))
        .orderBy(listingsTable.price)
        .limit(30);
      return { summary: rows.length ? `I found ${rows.length} marketplace match${rows.length === 1 ? "" : "es"} for ${wanted.name || wanted.pokemonName}.` : `I did not find an active marketplace match for ${wanted.name || wanted.pokemonName}.`, data: rows };
    }
    case "list_decks": {
      const rows = await db.select({
        id: decksTable.id,
        name: decksTable.name,
        description: decksTable.description,
        gameStyle: decksTable.gameStyle,
        strategy: decksTable.strategy,
        cardCount: sql<number>`count(${deckCardsTable.id})::int`,
        totalCount: sql<number>`coalesce(sum(${deckCardsTable.count}), 0)::int`,
      }).from(decksTable)
        .leftJoin(deckCardsTable, eq(deckCardsTable.deckId, decksTable.id))
        .where(eq(decksTable.ownerClerkId, userId))
        .groupBy(decksTable.id)
        .orderBy(desc(decksTable.updatedAt))
        .limit(50);
      return { summary: `You have ${rows.length} deck${rows.length === 1 ? "" : "s"}.`, data: rows };
    }
    case "inspect_deck": {
      const [deck] = await db.select().from(decksTable).where(and(
        eq(decksTable.id, plan.args.deckId),
        eq(decksTable.ownerClerkId, userId),
      ));
      if (!deck) return { summary: "That deck is no longer available.", data: null };
      const cards = await db.select({
        entryId: deckCardsTable.id,
        count: deckCardsTable.count,
        role: deckCardsTable.role,
        name: deckCardsTable.snapshotName,
        setName: deckCardsTable.snapshotSetName,
        cardNumber: deckCardsTable.snapshotCardNumber,
        imageUrl: deckCardsTable.snapshotImageUrl,
        ownedCardId: deckCardsTable.cardId,
      }).from(deckCardsTable)
        .where(eq(deckCardsTable.deckId, deck.id))
        .orderBy(deckCardsTable.createdAt)
        .limit(100);
      return { summary: `${deck.name} contains ${cards.reduce((sum, card) => sum + card.count, 0)} cards across ${cards.length} entries.`, data: { deck: { id: deck.id, name: deck.name, description: deck.description, gameStyle: deck.gameStyle, strategy: deck.strategy }, cards } };
    }
    default:
      throw new Error("Mutation plans require preview");
  }
}

async function createMutationPreview(userId: string, plan: AssistantPlan) {
  if (plan.action !== "update_wanted_budget" && plan.action !== "close_wanted") {
    throw new Error("Unsupported mutation");
  }
  const [wanted] = await db.select().from(wantedListingsTable).where(and(
    eq(wantedListingsTable.id, plan.args.wantedListingId),
    eq(wantedListingsTable.ownerClerkId, userId),
    activeWanted,
  ));
  if (!wanted) return null;
  const summary = plan.action === "update_wanted_budget"
    ? `Change the maximum price for ${wanted.name || wanted.pokemonName} from ${wanted.maxPrice == null ? "no limit" : `$${Number(wanted.maxPrice).toFixed(2)}`} to $${plan.args.maxPrice.toFixed(2)}.`
    : `Close your Looking For request for ${wanted.name || wanted.pokemonName}.`;
  return {
    summary,
    confirmationToken: createConfirmationToken({
      userId,
      plan,
      baseline: {
        status: wanted.status,
        maxPrice: wanted.maxPrice == null ? null : String(wanted.maxPrice),
        expiresAt: wanted.expiresAt?.toISOString() ?? null,
      },
      expiresAt: Date.now() + 10 * 60_000,
    }),
    expiresInSeconds: 600,
  };
}

router.post("/assistant/message", requireAuth, async (req: Request, res: Response) => {
  const parsed = AssistantMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const userId = (req as AuthRequest).userId;
  let request = parsed.data.message;
  if (parsed.data.continuationToken) {
    const continuation = verifyContinuationToken(parsed.data.continuationToken, userId);
    if (!continuation) {
      res.status(400).json({ error: "Clarification expired or invalid. Please ask again." });
      return;
    }
    request = `Original request: ${continuation.originalRequest}\nUser clarification: ${request}`;
  }
  const context = await loadRoutingContext(userId);
  const interpretation = await routeAssistantRequest(request, context);
  if (interpretation.kind === "clarification") {
    res.status(interpretation.unavailable ? 503 : 200).json({
      kind: "clarification",
      message: interpretation.question,
      confidence: interpretation.confidence,
      unavailable: interpretation.unavailable,
      continuationToken: createContinuationToken({
        userId,
        originalRequest: request.slice(0, 1000),
        expiresAt: Date.now() + 10 * 60_000,
      }),
    });
    return;
  }
  const { plan } = interpretation;
  if (plan.action === "update_wanted_budget" || plan.action === "close_wanted") {
    const preview = await createMutationPreview(userId, plan);
    if (!preview) {
      res.status(409).json({ error: "That Looking For request is no longer active" });
      return;
    }
    res.json({ kind: "confirmation", action: plan.action, confidence: interpretation.confidence, ...preview });
    return;
  }
  const result = await executeReadPlan(userId, plan);
  res.json({ kind: "result", action: plan.action, confidence: interpretation.confidence, ...result });
});

router.post("/assistant/confirm", requireAuth, async (req: Request, res: Response) => {
  const parsed = AssistantConfirmBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const payload = verifyConfirmationToken(parsed.data.confirmationToken, userId);
  if (!payload) {
    res.status(400).json({ error: "Confirmation expired or invalid. Ask the assistant to prepare the change again." });
    return;
  }
  const { plan } = payload;
  if (plan.action !== "update_wanted_budget" && plan.action !== "close_wanted") {
    res.status(400).json({ error: "This action cannot be confirmed" });
    return;
  }
  const baselineConditions = [
    eq(wantedListingsTable.id, plan.args.wantedListingId),
    eq(wantedListingsTable.ownerClerkId, userId),
    eq(wantedListingsTable.status, payload.baseline.status),
    payload.baseline.maxPrice == null
      ? isNull(wantedListingsTable.maxPrice)
      : eq(wantedListingsTable.maxPrice, payload.baseline.maxPrice),
    payload.baseline.expiresAt == null
      ? isNull(wantedListingsTable.expiresAt)
      : eq(wantedListingsTable.expiresAt, new Date(payload.baseline.expiresAt)),
    activeWanted,
  ];
  const [updated] = await db.update(wantedListingsTable)
    .set(plan.action === "update_wanted_budget"
      ? { maxPrice: String(plan.args.maxPrice) }
      : { status: "closed" })
    .where(and(
      ...baselineConditions,
    ))
    .returning();
  if (!updated) {
    res.status(409).json({ error: "This preview is stale. Ask the assistant to prepare the change again." });
    return;
  }
  res.json({
    kind: "completed",
    action: plan.action,
    summary: plan.action === "update_wanted_budget"
      ? `Updated the maximum price for ${updated.name || updated.pokemonName} to $${Number(updated.maxPrice).toFixed(2)}.`
      : `Closed the Looking For request for ${updated.name || updated.pokemonName}.`,
    data: wantedSummary(updated),
  });
});

export default router;