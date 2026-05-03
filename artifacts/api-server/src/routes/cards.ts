import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, activityEventsTable } from "@workspace/db";
import { searchTcgdex, fetchPricingById } from "./detect-helpers.js";
import { eq, sql, ilike, and, type SQL } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListCardsQueryParams,
  CreateCardBody,
  UpdateCardBody,
  GetCardParams,
  UpdateCardParams,
  DeleteCardParams,
} from "@workspace/api-zod";

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
  createdAt: cardsTable.createdAt,
  updatedAt: cardsTable.updatedAt,
};

router.get("/cards", async (req, res) => {
  const parsed = ListCardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { categoryId, forSale, search, rarity } = parsed.data;
  const conditions: SQL[] = [];
  if (categoryId !== undefined) conditions.push(eq(cardsTable.categoryId, categoryId));
  if (forSale !== undefined) conditions.push(eq(cardsTable.forSale, forSale));
  if (search) conditions.push(ilike(cardsTable.name, `%${search}%`));
  if (rarity) conditions.push(eq(cardsTable.rarity, rarity));

  const cards = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(cardsTable.createdAt);

  res.json(cards);
});

router.post("/cards", async (req, res) => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }
  const data = parsed.data;
  const auth = getAuth(req as never);
  const clerkId = auth?.userId ?? null;
  const source = (req.body.source as string | undefined) ?? "manual";

  const [card] = await db.insert(cardsTable).values({
    name: data.name,
    pokemonName: data.pokemonName,
    rarity: data.rarity,
    condition: data.condition,
    forSale: data.forSale,
    setName: data.setName ?? null,
    cardNumber: data.cardNumber ?? null,
    imageUrl: data.imageUrl ?? null,
    estimatedValue: data.estimatedValue != null ? String(data.estimatedValue) : null,
    acquiredDate: data.acquiredDate ?? null,
    categoryId: data.categoryId ?? null,
    listingPrice: data.listingPrice != null ? String(data.listingPrice) : null,
    notes: data.notes ?? null,
  }).returning();

  const [withCat] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, card.id));

  await db.insert(activityEventsTable).values({
    type: source === "scan" ? "card_scanned" : "card_added",
    clerkId,
    cardId: card.id,
    metadata: {
      name: card.name,
      pokemonName: card.pokemonName,
      imageUrl: card.imageUrl,
      estimatedValue: card.estimatedValue,
      setName: card.setName,
    },
  });

  res.status(201).json(withCat);
});

router.get("/cards/lookup", async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const { variants, pricing } = await searchTcgdex(name);
  res.json({ card: variants[0] ?? null, variants, pricing });
});

router.get("/cards/pricing", async (req, res) => {
  const cardId = String(req.query.cardId ?? "").trim();
  if (!cardId) { res.status(400).json({ error: "cardId is required" }); return; }
  res.setHeader("Cache-Control", "no-store");
  const pricing = await fetchPricingById(cardId);
  res.json({ pricing });
});

router.get("/cards/:id", async (req, res) => {
  const parsed = GetCardParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [card] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, parsed.data.id));

  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  res.json(card);
});

router.put("/cards/:id", async (req, res) => {
  const paramsParsed = UpdateCardParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateCardBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const data = bodyParsed.data;
  const auth = getAuth(req as never);
  const clerkId = auth?.userId ?? null;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.pokemonName !== undefined) updateData.pokemonName = data.pokemonName;
  if (data.setName !== undefined) updateData.setName = data.setName;
  if (data.cardNumber !== undefined) updateData.cardNumber = data.cardNumber;
  if (data.rarity !== undefined) updateData.rarity = data.rarity;
  if (data.condition !== undefined) updateData.condition = data.condition;
  if (data.imageUrl !== undefined) updateData.imageUrl = data.imageUrl;
  if (data.estimatedValue !== undefined) updateData.estimatedValue = data.estimatedValue != null ? String(data.estimatedValue) : null;
  if (data.acquiredDate !== undefined) updateData.acquiredDate = data.acquiredDate;
  if (data.categoryId !== undefined) updateData.categoryId = data.categoryId;
  if (data.forSale !== undefined) updateData.forSale = data.forSale;
  if (data.listingPrice !== undefined) updateData.listingPrice = data.listingPrice != null ? String(data.listingPrice) : null;
  if (data.notes !== undefined) updateData.notes = data.notes;

  await db
    .update(cardsTable)
    .set(updateData)
    .where(eq(cardsTable.id, paramsParsed.data.id));

  const [updated] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, paramsParsed.data.id));

  if (!updated) {
    res.status(404).json({ error: "Card not found" });
    return;
  }

  await db.insert(activityEventsTable).values({
    type: "card_updated",
    clerkId,
    cardId: updated.id,
    metadata: {
      name: updated.name,
      pokemonName: updated.pokemonName,
      imageUrl: updated.imageUrl,
      setName: updated.setName,
    },
  });

  res.json(updated);
});

router.delete("/cards/:id", async (req, res) => {
  const parsed = DeleteCardParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(cardsTable).where(eq(cardsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
