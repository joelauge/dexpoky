import { Router } from "express";
import { db } from "@workspace/db";
import {
  decksTable,
  deckCardsTable,
  cardsTable,
  categoriesTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  CreateDeckBody,
  UpdateDeckBody,
  AddDeckCardBody,
  SuggestDeckBody,
} from "@workspace/api-zod";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const cardSelect = {
  id: cardsTable.id,
  name: cardsTable.name,
  pokemonName: cardsTable.pokemonName,
  setName: cardsTable.setName,
  cardNumber: cardsTable.cardNumber,
  rarity: cardsTable.rarity,
  condition: cardsTable.condition,
  imageUrl: cardsTable.imageUrl,
  estimatedValue: sql<number | null>`${cardsTable.estimatedValue}::float`,
  acquiredDate: cardsTable.acquiredDate,
  categoryId: cardsTable.categoryId,
  categoryName: categoriesTable.name,
  forSale: cardsTable.forSale,
  listingPrice: sql<number | null>`${cardsTable.listingPrice}::float`,
  notes: cardsTable.notes,
  ownerClerkId: cardsTable.ownerClerkId,
  createdAt: cardsTable.createdAt,
  updatedAt: cardsTable.updatedAt,
};

async function loadDeckWithCards(deckId: number) {
  const [deck] = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.id, deckId));
  if (!deck) return null;

  const rows = await db
    .select({
      cardId: deckCardsTable.cardId,
      count: deckCardsTable.count,
      role: deckCardsTable.role,
      notes: deckCardsTable.notes,
      card: cardSelect,
    })
    .from(deckCardsTable)
    .innerJoin(cardsTable, eq(cardsTable.id, deckCardsTable.cardId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(deckCardsTable.deckId, deckId))
    .orderBy(deckCardsTable.createdAt);

  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    gameStyle: deck.gameStyle,
    strategy: deck.strategy,
    cards: rows,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };
}

router.get("/decks", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const decks = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.ownerClerkId, userId))
    .orderBy(decksTable.updatedAt);

  if (decks.length === 0) {
    res.json([]);
    return;
  }

  const deckIds = decks.map((d) => d.id);
  const counts = await db
    .select({
      deckId: deckCardsTable.deckId,
      cardCount: sql<number>`count(*)::int`,
      totalCount: sql<number>`coalesce(sum(${deckCardsTable.count}), 0)::int`,
    })
    .from(deckCardsTable)
    .where(inArray(deckCardsTable.deckId, deckIds))
    .groupBy(deckCardsTable.deckId);

  const covers = await db
    .select({
      deckId: deckCardsTable.deckId,
      imageUrl: cardsTable.imageUrl,
      createdAt: deckCardsTable.createdAt,
    })
    .from(deckCardsTable)
    .innerJoin(cardsTable, eq(cardsTable.id, deckCardsTable.cardId))
    .where(inArray(deckCardsTable.deckId, deckIds));

  const countByDeck = new Map(counts.map((c) => [c.deckId, c]));
  const coverByDeck = new Map<number, string | null>();
  for (const c of covers) {
    if (!c.imageUrl) continue;
    if (!coverByDeck.has(c.deckId)) coverByDeck.set(c.deckId, c.imageUrl);
  }

  res.json(
    decks
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        gameStyle: d.gameStyle,
        strategy: d.strategy,
        cardCount: countByDeck.get(d.id)?.cardCount ?? 0,
        totalCount: countByDeck.get(d.id)?.totalCount ?? 0,
        coverImageUrl: coverByDeck.get(d.id) ?? null,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
  );
});

router.post("/decks", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateDeckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const data = parsed.data;

  // Accept either `cardIds: number[]` (legacy) or `cards: [{cardId, count, role, notes}]`
  // (preferred — preserves AI-suggested counts and roles).
  const rawBody = req.body as {
    cardIds?: unknown;
    cards?: unknown;
  };

  type EntryInput = { cardId: number; count: number; role: string | null; notes: string | null };
  const entryMap = new Map<number, EntryInput>();

  if (Array.isArray(rawBody.cards)) {
    for (const item of rawBody.cards) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const cardId = typeof obj.cardId === "number" && Number.isInteger(obj.cardId) ? obj.cardId : null;
      if (cardId == null) continue;
      const rawCount = typeof obj.count === "number" && Number.isInteger(obj.count) ? obj.count : 1;
      // Per official rules a deck has 60 cards and is limited to 4 of any same-named card EXCEPT
      // Basic Energy (no per-name cap). We can't always tell here whether this card is Basic Energy
      // (we'd need to look up the card row), so we use a permissive 1..60 sanity bound and rely on
      // the AI prompt + UI to enforce the 4-card cap for non-Basic-Energy cards.
      const count = Math.max(1, Math.min(60, rawCount));
      const role = typeof obj.role === "string" ? obj.role : null;
      const notes = typeof obj.notes === "string" ? obj.notes : null;
      entryMap.set(cardId, { cardId, count, role, notes });
    }
  } else if (Array.isArray(rawBody.cardIds)) {
    for (const n of rawBody.cardIds) {
      if (typeof n === "number" && Number.isInteger(n) && !entryMap.has(n)) {
        entryMap.set(n, { cardId: n, count: 1, role: null, notes: null });
      }
    }
  }

  const [deck] = await db
    .insert(decksTable)
    .values({
      ownerClerkId: userId,
      name: data.name,
      description: data.description ?? null,
      gameStyle: data.gameStyle,
      strategy: data.strategy ?? null,
    })
    .returning();

  if (entryMap.size > 0) {
    const requestedIds = Array.from(entryMap.keys());
    const owned = await db
      .select({ id: cardsTable.id })
      .from(cardsTable)
      .where(
        and(
          eq(cardsTable.ownerClerkId, userId),
          inArray(cardsTable.id, requestedIds),
        ),
      );
    const ownedSet = new Set(owned.map((c) => c.id));
    const toInsert = Array.from(entryMap.values())
      .filter((e) => ownedSet.has(e.cardId))
      .map((e) => ({
        deckId: deck.id,
        cardId: e.cardId,
        count: e.count,
        role: e.role,
        notes: e.notes,
      }));
    if (toInsert.length > 0) {
      await db.insert(deckCardsTable).values(toInsert).onConflictDoNothing();
    }
  }

  res.status(201).json(deck);
});

router.get("/decks/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deck] = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.id, id));
  if (!deck) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }
  if (deck.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const result = await loadDeckWithCards(id);
  res.json(result);
});

router.put("/decks/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  const parsed = UpdateDeckBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: decksTable.ownerClerkId })
    .from(decksTable)
    .where(eq(decksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const data = parsed.data;
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.gameStyle !== undefined) updateData.gameStyle = data.gameStyle;
  if (data.strategy !== undefined) updateData.strategy = data.strategy;
  await db.update(decksTable).set(updateData).where(eq(decksTable.id, id));
  const [updated] = await db
    .select()
    .from(decksTable)
    .where(eq(decksTable.id, id));
  res.json(updated);
});

router.delete("/decks/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: decksTable.ownerClerkId })
    .from(decksTable)
    .where(eq(decksTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }
  if (existing.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db.delete(decksTable).where(eq(decksTable.id, id));
  res.status(204).send();
});

router.post("/decks/:id/cards", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  const parsed = AddDeckCardBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [deck] = await db
    .select({ ownerClerkId: decksTable.ownerClerkId })
    .from(decksTable)
    .where(eq(decksTable.id, id));
  if (!deck) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }
  if (deck.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const [card] = await db
    .select({ id: cardsTable.id, ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable)
    .where(eq(cardsTable.id, parsed.data.cardId));
  if (!card || card.ownerClerkId !== userId) {
    res.status(400).json({ error: "Card not in your collection" });
    return;
  }
  const desiredCount = parsed.data.count ?? 1;
  await db
    .insert(deckCardsTable)
    .values({
      deckId: id,
      cardId: parsed.data.cardId,
      count: desiredCount,
      role: parsed.data.role ?? null,
      notes: parsed.data.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [deckCardsTable.deckId, deckCardsTable.cardId],
      set: {
        count: sql`${deckCardsTable.count} + ${desiredCount}`,
      },
    });
  await db
    .update(decksTable)
    .set({ updatedAt: new Date() })
    .where(eq(decksTable.id, id));
  const result = await loadDeckWithCards(id);
  res.status(201).json(result);
});

router.delete("/decks/:id/cards/:cardId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  const cardId = Number(req.params.cardId);
  if (!Number.isInteger(id) || !Number.isInteger(cardId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [deck] = await db
    .select({ ownerClerkId: decksTable.ownerClerkId })
    .from(decksTable)
    .where(eq(decksTable.id, id));
  if (!deck) {
    res.status(404).json({ error: "Deck not found" });
    return;
  }
  if (deck.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .delete(deckCardsTable)
    .where(
      and(eq(deckCardsTable.deckId, id), eq(deckCardsTable.cardId, cardId)),
    );
  await db
    .update(decksTable)
    .set({ updatedAt: new Date() })
    .where(eq(decksTable.id, id));
  res.status(204).send();
});

router.post("/decks/suggest", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = SuggestDeckBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const { gameStyle, notes } = parsed.data;

  const collection = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      pokemonName: cardsTable.pokemonName,
      setName: cardsTable.setName,
      rarity: cardsTable.rarity,
    })
    .from(cardsTable)
    .where(eq(cardsTable.ownerClerkId, userId));

  if (collection.length === 0) {
    res.status(400).json({
      error:
        "Your collection is empty — add or scan some cards before generating a deck.",
    });
    return;
  }

  // Truncate to keep token usage in check
  const cardsForAI = collection.slice(0, 200).map((c) => ({
    id: c.id,
    name: c.name,
    pokemon: c.pokemonName,
    set: c.setName ?? undefined,
    rarity: c.rarity,
  }));

  const styleDescriptions: Record<string, string> = {
    aggro: "Fast, low-cost attackers that win quickly through damage pressure.",
    control:
      "Disruption, healing, energy denial, and trainer support to outlast the opponent.",
    midrange:
      "Balanced curve of attackers and support, flexible against multiple matchups.",
    combo:
      "Specific multi-card synergies that produce a powerful turn or chain.",
    mill: "Force the opponent to deck out by removing cards from their deck and hand.",
    tank: "High-HP Pokémon supported by healing, energy ramp, and damage reduction.",
  };

  const systemPrompt = `You are an expert Pokémon TCG deck builder. Build the strongest possible deck a player could realistically run from THEIR collection only.

OFFICIAL DECK BUILDING RULES (Scarlet & Violet rulebook):
- A legal deck is EXACTLY 60 cards.
- Maximum 4 copies of any card with the same name (Basic Energy is exempt — you may include any number).
- The deck must contain at least 1 Basic Pokémon (otherwise the player cannot start the game).
- Special restrictions when relevant: only 1 Radiant Pokémon per deck; only 1 ACE SPEC card total per deck; only 1 of any specific Prism Star card.
- Recommended starting ratios for a 60-card deck: 12–15 Energy, 20–25 Trainer cards (Items, Supporters, Stadiums, Tools), and the remainder Pokémon (try to run 4 of each Pokémon in an evolution line).
- Pick 1–2 Energy types so attackers can reliably power up; Colorless costs accept any Energy.

DECK BUILD TASK:
We are working with a curated subset of the user's collection. Recommend the strongest 15–30 cards (or all of them if fewer) that fit the requested archetype, respecting the 4-copy limit and ensuring the suggestion includes at least one Basic Pokémon when possible.

For each recommended card include: cardId (must exist in the supplied collection), count (1–4 typical, never more than 4 for non-Basic-Energy), role (one of: attacker | support | trainer | energy | tech), and a short reason. Also produce a deck name and a 2–4 sentence strategy summary explaining the win condition and key turns. If the collection cannot legally form a 60-card deck, still suggest the best partial core and call out what's missing in the strategy summary.`;

  const userPrompt = `Game style: ${gameStyle} — ${styleDescriptions[gameStyle] ?? ""}
${notes ? `Player notes: ${notes}\n` : ""}
Available collection (cardId, name, pokemon, set, rarity):
${JSON.stringify(cardsForAI)}`;

  type SuggestedCard = {
    cardId: number;
    count: number;
    role?: string | null;
    reason: string;
  };
  type AIResponse = {
    name: string;
    strategy: string;
    cards: SuggestedCard[];
  };

  let aiResult: AIResponse;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${userPrompt}\n\nReturn ONLY valid JSON with the exact shape: { "name": string, "strategy": string, "cards": Array<{ "cardId": number, "count": number, "role": string, "reason": string }> }`,
        },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!text) throw new Error("Empty AI response");
    aiResult = JSON.parse(text) as AIResponse;
  } catch (err) {
    req.log?.error({ err }, "deck suggestion failed");
    res
      .status(502)
      .json({ error: "AI deck suggestion failed. Please try again." });
    return;
  }

  // Filter to cards the user actually owns
  const ownedIds = new Set(collection.map((c) => c.id));
  const suggested = (aiResult.cards ?? [])
    .filter(
      (c) =>
        c &&
        typeof c.cardId === "number" &&
        ownedIds.has(c.cardId) &&
        typeof c.reason === "string",
    )
    .map((c) => ({
      cardId: c.cardId,
      count: Math.max(1, Math.min(4, Number(c.count) || 1)),
      role: c.role ?? null,
      reason: c.reason,
    }));

  res.json({
    name: aiResult.name || `${gameStyle} deck`,
    gameStyle,
    strategy: aiResult.strategy || "",
    cards: suggested,
  });
});

export default router;
