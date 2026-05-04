import { Router } from "express";
import { db } from "@workspace/db";
import {
  decksTable,
  deckCardsTable,
  cardsTable,
  categoriesTable,
  wishlistItemsTable,
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
import { getDeckBuildingSectionText } from "./rules.js";
import { pwGetCard, normalizeCatalogCard } from "../lib/pokewallet.js";

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
  catalogCardId: cardsTable.catalogCardId,
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
      entryId: deckCardsTable.id,
      cardId: deckCardsTable.cardId,
      catalogCardId: deckCardsTable.catalogCardId,
      wishlistItemId: deckCardsTable.wishlistItemId,
      snapshotName: deckCardsTable.snapshotName,
      snapshotImageUrl: deckCardsTable.snapshotImageUrl,
      snapshotSetName: deckCardsTable.snapshotSetName,
      snapshotCardNumber: deckCardsTable.snapshotCardNumber,
      count: deckCardsTable.count,
      role: deckCardsTable.role,
      notes: deckCardsTable.notes,
      // Owned card join (nullable)
      ownedCard: cardSelect,
    })
    .from(deckCardsTable)
    .leftJoin(cardsTable, eq(cardsTable.id, deckCardsTable.cardId))
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(deckCardsTable.deckId, deckId))
    .orderBy(deckCardsTable.createdAt);

  const cards = rows.map((r) => {
    const source: "owned" | "wishlist" | "catalog" = r.cardId
      ? "owned"
      : r.wishlistItemId
        ? "wishlist"
        : "catalog";
    return {
      entryId: r.entryId,
      source,
      cardId: r.cardId,
      catalogCardId: r.catalogCardId,
      wishlistItemId: r.wishlistItemId,
      snapshotName: r.snapshotName,
      snapshotImageUrl: r.snapshotImageUrl,
      snapshotSetName: r.snapshotSetName,
      snapshotCardNumber: r.snapshotCardNumber,
      count: r.count,
      role: r.role,
      notes: r.notes,
      // Only owned cards have full Card objects
      card: r.cardId ? r.ownedCard : null,
    };
  });

  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    gameStyle: deck.gameStyle,
    strategy: deck.strategy,
    cards,
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

  // Cover image: prefer owned card image, then deck-card snapshot
  const covers = await db
    .select({
      deckId: deckCardsTable.deckId,
      ownedImageUrl: cardsTable.imageUrl,
      snapshotImageUrl: deckCardsTable.snapshotImageUrl,
      createdAt: deckCardsTable.createdAt,
    })
    .from(deckCardsTable)
    .leftJoin(cardsTable, eq(cardsTable.id, deckCardsTable.cardId))
    .where(inArray(deckCardsTable.deckId, deckIds))
    .orderBy(deckCardsTable.createdAt);

  const countByDeck = new Map(counts.map((c) => [c.deckId, c]));
  const coverByDeck = new Map<number, string | null>();
  for (const c of covers) {
    const url = c.ownedImageUrl ?? c.snapshotImageUrl;
    if (!url) continue;
    if (!coverByDeck.has(c.deckId)) coverByDeck.set(c.deckId, url);
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

  // Accept either:
  //   - `cardIds: number[]` (legacy owned ids)
  //   - `cards: [{cardId, count, role, notes}]` (legacy)
  //   - `cards: [{source:"owned"|"wishlist", cardId|wishlistItemId, ...}]` (new)
  const rawBody = req.body as { cardIds?: unknown; cards?: unknown };

  type OwnedEntry = { source: "owned"; cardId: number; count: number; role: string | null; notes: string | null };
  type WishlistEntry = { source: "wishlist"; wishlistItemId: number; count: number; role: string | null; notes: string | null };
  type EntryInput = OwnedEntry | WishlistEntry;

  const entries: EntryInput[] = [];
  const ownedIds = new Set<number>();
  const wishlistIds = new Set<number>();

  if (Array.isArray(rawBody.cards)) {
    for (const item of rawBody.cards) {
      if (!item || typeof item !== "object") continue;
      const obj = item as Record<string, unknown>;
      const rawCount = typeof obj.count === "number" && Number.isInteger(obj.count) ? obj.count : 1;
      // Per official rules a deck has 60 cards and is limited to 4 of any same-named card EXCEPT
      // Basic Energy (no per-name cap). We use a permissive 1..60 sanity bound here and rely on
      // the AI prompt and UI to enforce the per-name cap for non-Basic-Energy cards.
      const count = Math.max(1, Math.min(60, rawCount));
      const role = typeof obj.role === "string" ? obj.role : null;
      const notes = typeof obj.notes === "string" ? obj.notes : null;
      const wishlistItemId = typeof obj.wishlistItemId === "number" && Number.isInteger(obj.wishlistItemId) ? obj.wishlistItemId : null;
      const cardId = typeof obj.cardId === "number" && Number.isInteger(obj.cardId) ? obj.cardId : null;
      const explicitSource = typeof obj.source === "string" ? obj.source : null;

      if ((explicitSource === "wishlist" || (!explicitSource && wishlistItemId != null)) && wishlistItemId != null && !wishlistIds.has(wishlistItemId)) {
        wishlistIds.add(wishlistItemId);
        entries.push({ source: "wishlist", wishlistItemId, count, role, notes });
      } else if (cardId != null && !ownedIds.has(cardId)) {
        ownedIds.add(cardId);
        entries.push({ source: "owned", cardId, count, role, notes });
      }
    }
  } else if (Array.isArray(rawBody.cardIds)) {
    for (const n of rawBody.cardIds) {
      if (typeof n === "number" && Number.isInteger(n) && !ownedIds.has(n)) {
        ownedIds.add(n);
        entries.push({ source: "owned", cardId: n, count: 1, role: null, notes: null });
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

  if (entries.length > 0) {
    const ownedRequested = Array.from(ownedIds);
    const ownedRows = ownedRequested.length
      ? await db
          .select({ id: cardsTable.id, name: cardsTable.name })
          .from(cardsTable)
          .where(
            and(
              eq(cardsTable.ownerClerkId, userId),
              inArray(cardsTable.id, ownedRequested),
            ),
          )
      : [];
    const ownedById = new Map(ownedRows.map((c) => [c.id, c]));

    const wishlistRequested = Array.from(wishlistIds);
    const wishlistRows = wishlistRequested.length
      ? await db
          .select({
            id: wishlistItemsTable.id,
            catalogCardId: wishlistItemsTable.catalogCardId,
            name: wishlistItemsTable.name,
            imageUrl: wishlistItemsTable.imageUrl,
            setName: wishlistItemsTable.setName,
            cardNumber: wishlistItemsTable.cardNumber,
          })
          .from(wishlistItemsTable)
          .where(
            and(
              eq(wishlistItemsTable.ownerClerkId, userId),
              inArray(wishlistItemsTable.id, wishlistRequested),
            ),
          )
      : [];
    const wishlistMap = new Map(wishlistRows.map((w) => [w.id, w]));

    // Heuristic for Basic Energy (Pokémon TCG rules: no per-name cap on
    // Basic Energy; everything else is capped at 4 of the same name).
    const isBasicEnergy = (name: string) =>
      /^basic\s+.+\benergy\b/i.test(name.trim());

    const toInsert: Array<typeof deckCardsTable.$inferInsert> = [];
    for (const entry of entries) {
      if (entry.source === "owned") {
        const card = ownedById.get(entry.cardId);
        if (!card) continue;
        // Server-side legality cap: enforce 4-of-a-kind for non-Basic-Energy
        // cards. UI + AI prompt also enforce this, but a hostile/buggy client
        // could otherwise persist illegal counts.
        const cappedCount = isBasicEnergy(card.name)
          ? entry.count
          : Math.min(4, entry.count);
        toInsert.push({
          deckId: deck.id,
          cardId: entry.cardId,
          count: cappedCount,
          role: entry.role,
          notes: entry.notes,
        });
      } else {
        const w = wishlistMap.get(entry.wishlistItemId);
        if (!w) continue;
        // Wishlist snapshots are not real owned cards, so the Basic-Energy
        // exemption doesn't apply — cap at 4 unconditionally.
        toInsert.push({
          deckId: deck.id,
          cardId: null,
          catalogCardId: w.catalogCardId,
          wishlistItemId: w.id,
          snapshotName: w.name,
          snapshotImageUrl: w.imageUrl,
          snapshotSetName: w.setName,
          snapshotCardNumber: w.cardNumber,
          count: Math.min(4, entry.count),
          role: entry.role,
          notes: entry.notes,
        });
      }
    }
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

  const desiredCount = parsed.data.count ?? 1;
  const role = parsed.data.role ?? null;
  const notes = parsed.data.notes ?? null;

  if (parsed.data.cardId != null) {
    // Owned card path
    const [card] = await db
      .select({ id: cardsTable.id, ownerClerkId: cardsTable.ownerClerkId })
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.cardId));
    if (!card || card.ownerClerkId !== userId) {
      res.status(400).json({ error: "Card not in your collection" });
      return;
    }
    await db
      .insert(deckCardsTable)
      .values({
        deckId: id,
        cardId: parsed.data.cardId,
        count: desiredCount,
        role,
        notes,
      })
      .onConflictDoUpdate({
        target: [deckCardsTable.deckId, deckCardsTable.cardId],
        set: { count: sql`${deckCardsTable.count} + ${desiredCount}` },
      });
  } else if (parsed.data.wishlistItemId != null) {
    // Wishlist-backed catalog entry
    const [w] = await db
      .select()
      .from(wishlistItemsTable)
      .where(eq(wishlistItemsTable.id, parsed.data.wishlistItemId));
    if (!w || w.ownerClerkId !== userId) {
      res.status(400).json({ error: "Wishlist item not found" });
      return;
    }
    await db
      .insert(deckCardsTable)
      .values({
        deckId: id,
        cardId: null,
        catalogCardId: w.catalogCardId,
        wishlistItemId: w.id,
        snapshotName: w.name,
        snapshotImageUrl: w.imageUrl,
        snapshotSetName: w.setName,
        snapshotCardNumber: w.cardNumber,
        count: desiredCount,
        role,
        notes,
      })
      .onConflictDoUpdate({
        target: [deckCardsTable.deckId, deckCardsTable.catalogCardId],
        set: { count: sql`${deckCardsTable.count} + ${desiredCount}` },
      });
  } else if (parsed.data.catalogCardId != null) {
    // Pure catalog entry (snapshot from PokeWallet)
    const lookup = await pwGetCard(parsed.data.catalogCardId);
    if (!lookup.ok) {
      res.status(503).json({ error: "Catalog temporarily unavailable" });
      return;
    }
    const norm = normalizeCatalogCard(lookup.data);
    await db
      .insert(deckCardsTable)
      .values({
        deckId: id,
        cardId: null,
        catalogCardId: norm.id,
        snapshotName: norm.name,
        snapshotImageUrl: norm.imageUrl || null,
        snapshotSetName: norm.setName || null,
        snapshotCardNumber: norm.cardNumber || null,
        count: desiredCount,
        role,
        notes,
      })
      .onConflictDoUpdate({
        target: [deckCardsTable.deckId, deckCardsTable.catalogCardId],
        set: { count: sql`${deckCardsTable.count} + ${desiredCount}` },
      });
  } else {
    res.status(400).json({ error: "cardId, wishlistItemId or catalogCardId is required" });
    return;
  }

  await db
    .update(decksTable)
    .set({ updatedAt: new Date() })
    .where(eq(decksTable.id, id));
  const result = await loadDeckWithCards(id);
  res.status(201).json(result);
});

/**
 * Remove an entry. The `:cardId` segment can be either a numeric owned-card id
 * (legacy) or a `entry-<id>` token referring to a deck_cards row id (new way
 * that supports catalog/wishlist entries).
 */
router.delete("/decks/:id/cards/:cardId", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = Number(req.params.id);
  const param = String(req.params.cardId ?? "");
  if (!Number.isInteger(id) || !param) {
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

  if (param.startsWith("entry-")) {
    const entryId = Number(param.slice("entry-".length));
    if (!Number.isInteger(entryId)) {
      res.status(400).json({ error: "Invalid entry id" });
      return;
    }
    await db
      .delete(deckCardsTable)
      .where(and(eq(deckCardsTable.id, entryId), eq(deckCardsTable.deckId, id)));
  } else {
    const cardId = Number(param);
    if (!Number.isInteger(cardId)) {
      res.status(400).json({ error: "Invalid card id" });
      return;
    }
    await db
      .delete(deckCardsTable)
      .where(
        and(eq(deckCardsTable.deckId, id), eq(deckCardsTable.cardId, cardId)),
      );
  }
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

  const [collection, wishlist] = await Promise.all([
    db
      .select({
        id: cardsTable.id,
        name: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        rarity: cardsTable.rarity,
        imageUrl: cardsTable.imageUrl,
      })
      .from(cardsTable)
      .where(eq(cardsTable.ownerClerkId, userId)),
    db
      .select({
        id: wishlistItemsTable.id,
        catalogCardId: wishlistItemsTable.catalogCardId,
        name: wishlistItemsTable.name,
        pokemonName: wishlistItemsTable.pokemonName,
        setName: wishlistItemsTable.setName,
        cardNumber: wishlistItemsTable.cardNumber,
        rarity: wishlistItemsTable.rarity,
        imageUrl: wishlistItemsTable.imageUrl,
      })
      .from(wishlistItemsTable)
      .where(eq(wishlistItemsTable.ownerClerkId, userId)),
  ]);

  if (collection.length === 0 && wishlist.length === 0) {
    res.status(400).json({
      error:
        "Your collection and wishlist are both empty — add or scan some cards (or save some to your wishlist) before generating a deck.",
    });
    return;
  }

  // Truncate to keep token usage in check. Owned cards prioritized first.
  const ownedForAI = collection.slice(0, 150).map((c) => ({
    source: "owned" as const,
    cardId: c.id,
    name: c.name,
    pokemon: c.pokemonName,
    set: c.setName ?? undefined,
    rarity: c.rarity,
  }));
  const wishlistForAI = wishlist.slice(0, 50).map((w) => ({
    source: "wishlist" as const,
    wishlistItemId: w.id,
    name: w.name,
    pokemon: w.pokemonName,
    set: w.setName ?? undefined,
    rarity: w.rarity,
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

  const deckBuildingRules = getDeckBuildingSectionText();

  const systemPrompt = `You are an expert Pokémon TCG deck builder. Build the strongest possible deck for the player.

OFFICIAL DECK BUILDING RULES (verbatim from the Scarlet & Violet rulebook):
"""
${deckBuildingRules}
"""

QUICK SUMMARY OF THE RULES YOU MUST RESPECT:
- A legal deck is EXACTLY 60 cards.
- Maximum 4 copies of any card with the same English name (Basic Energy is exempt — you may include any number of Basic Energy of each type).
- The deck must contain at least 1 Basic Pokémon (otherwise the player cannot start the game).
- Special restrictions when relevant: only 1 Radiant Pokémon per deck; only 1 ACE SPEC card total per deck; only 1 of any specific Prism Star card.
- Recommended starting ratios for a 60-card deck: 12–15 Energy, 20–25 Trainer cards (Items, Supporters, Stadiums, Tools), and the remainder Pokémon.
- Pick 1–2 Energy types so attackers can reliably power up.

CARD POOLS:
We give you TWO pools:
1) "owned" — cards already in the player's collection.
2) "wishlist" — cards the player wants but does not yet own. You may include these to fill gaps; clearly mark them with source="wishlist". Prefer owned cards first.

BUILD TASK:
Recommend the strongest 15–30 cards (or all available if fewer) that fit the requested archetype. For each recommended card include: source ("owned" or "wishlist"), the matching id (cardId for owned, wishlistItemId for wishlist), count (1–4 typical, never more than 4 for non-Basic-Energy), role (attacker | support | trainer | energy | tech), and a short reason. Prefer owned cards first; only pull from wishlist to fill gaps.

ALWAYS produce:
- A deck name.
- A "strategy" summary of 3–5 sentences. The strategy MUST explicitly quantify what's missing to reach a tournament-legal 60-card deck — for example: "this 24-card core needs ~36 more cards: 13 Basic Energy, ~15 Trainers (Supporters/Items), and 2 backup attackers". Use the recommended ratios above to compute the gap.
- If the collection + wishlist cannot legally form a 60-card deck, still suggest the best partial core and call out what's missing in the strategy.`;

  const userPrompt = `Game style: ${gameStyle} — ${styleDescriptions[gameStyle] ?? ""}
${notes ? `Player notes: ${notes}\n` : ""}
OWNED cards (cardId, name, pokemon, set, rarity):
${JSON.stringify(ownedForAI)}

WISHLIST cards (wishlistItemId, name, pokemon, set, rarity):
${JSON.stringify(wishlistForAI)}`;

  type SuggestedCard = {
    source?: string;
    cardId?: number | null;
    wishlistItemId?: number | null;
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
          content: `${userPrompt}\n\nReturn ONLY valid JSON with the exact shape: { "name": string, "strategy": string, "cards": Array<{ "source": "owned"|"wishlist", "cardId": number|null, "wishlistItemId": number|null, "count": number, "role": string, "reason": string }> }`,
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

  const ownedById = new Map(collection.map((c) => [c.id, c]));
  const wishlistById = new Map(wishlist.map((w) => [w.id, w]));

  const suggested = (aiResult.cards ?? [])
    .map((c) => {
      if (!c || typeof c.reason !== "string") return null;
      const count = Math.max(1, Math.min(4, Number(c.count) || 1));
      const role = c.role ?? null;

      // Owned candidate
      if (c.source === "owned" || (c.cardId != null && c.source !== "wishlist")) {
        const owned = c.cardId != null ? ownedById.get(c.cardId) : null;
        if (owned) {
          return {
            source: "owned" as const,
            cardId: owned.id,
            wishlistItemId: null,
            catalogCardId: null,
            name: owned.name,
            imageUrl: owned.imageUrl,
            setName: owned.setName,
            cardNumber: owned.cardNumber,
            count,
            role,
            reason: c.reason,
          };
        }
      }

      // Wishlist candidate
      if (c.source === "wishlist" || c.wishlistItemId != null) {
        const w = c.wishlistItemId != null ? wishlistById.get(c.wishlistItemId) : null;
        if (w) {
          return {
            source: "wishlist" as const,
            cardId: null,
            wishlistItemId: w.id,
            catalogCardId: w.catalogCardId,
            name: w.name,
            imageUrl: w.imageUrl,
            setName: w.setName,
            cardNumber: w.cardNumber,
            count,
            role,
            reason: c.reason,
          };
        }
      }
      return null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  res.json({
    name: aiResult.name || `${gameStyle} deck`,
    gameStyle,
    strategy: aiResult.strategy || "",
    cards: suggested,
  });
});

export default router;
