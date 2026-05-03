import { Router } from "express";
import { db } from "@workspace/db";
import { listingsTable, cardsTable, categoriesTable } from "@workspace/db";
import { eq, sql, and, gte, lte, type SQL } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  ListListingsQueryParams,
  CreateListingBody,
  UpdateListingBody,
  GetListingParams,
  UpdateListingParams,
  DeleteListingParams,
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

async function enrichListing(listing: typeof listingsTable.$inferSelect) {
  const [card] = await db
    .select(cardSelect)
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.id, listing.cardId));
  return {
    ...listing,
    price: parseFloat(String(listing.price)),
    currentBid: listing.currentBid ? parseFloat(String(listing.currentBid)) : null,
    reservePrice: listing.reservePrice ? parseFloat(String(listing.reservePrice)) : null,
    startingBid: listing.startingBid ? parseFloat(String(listing.startingBid)) : null,
    buyNowPrice: listing.buyNowPrice ? parseFloat(String(listing.buyNowPrice)) : null,
    minBidIncrement: listing.minBidIncrement ? parseFloat(String(listing.minBidIncrement)) : null,
    card: card ?? null,
  };
}

router.get("/marketplace", async (req, res) => {
  const parsed = ListListingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { status, search, minPrice, maxPrice } = parsed.data;
  const conditions: SQL[] = [eq(listingsTable.status, status ?? "active")];
  if (minPrice !== undefined) conditions.push(gte(sql`${listingsTable.price}::numeric`, String(minPrice)));
  if (maxPrice !== undefined) conditions.push(lte(sql`${listingsTable.price}::numeric`, String(maxPrice)));

  const listings = await db
    .select()
    .from(listingsTable)
    .where(and(...conditions))
    .orderBy(listingsTable.createdAt);

  let enriched = await Promise.all(listings.map(enrichListing));

  if (search) {
    const s = search.toLowerCase();
    enriched = enriched.filter(
      (l) =>
        l.card?.name?.toLowerCase().includes(s) ||
        l.card?.pokemonName?.toLowerCase().includes(s),
    );
  }

  res.json(enriched);
});

router.post("/marketplace", async (req, res) => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }

  const auth = getAuth(req as never);
  const sellerClerkId = auth?.userId ?? null;

  const listingType = req.body.listingType === "auction" ? "auction" : "buy_now";

  const values: Record<string, unknown> = {
    cardId: parsed.data.cardId,
    price: String(parsed.data.price),
    description: parsed.data.description ?? null,
    status: "active",
    listingType,
    sellerClerkId,
  };

  if (listingType === "auction") {
    if (req.body.startingBid) values.startingBid = String(req.body.startingBid);
    if (req.body.reservePrice) values.reservePrice = String(req.body.reservePrice);
    if (req.body.auctionEndTime) values.auctionEndTime = new Date(req.body.auctionEndTime);
    if (req.body.minBidIncrement) values.minBidIncrement = String(req.body.minBidIncrement);
    if (req.body.buyNowPrice) values.buyNowPrice = String(req.body.buyNowPrice);
  }

  const [listing] = await db
    .insert(listingsTable)
    .values(values as Parameters<typeof db.insert>[0] extends never ? never : never)
    .returning();

  await db
    .update(cardsTable)
    .set({ forSale: true, listingPrice: String(parsed.data.price) })
    .where(eq(cardsTable.id, parsed.data.cardId));

  res.status(201).json(await enrichListing(listing));
});

router.get("/marketplace/:id", async (req, res) => {
  const parsed = GetListingParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, parsed.data.id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  await db
    .update(listingsTable)
    .set({ viewCount: listing.viewCount + 1 })
    .where(eq(listingsTable.id, listing.id));

  res.json(await enrichListing({ ...listing, viewCount: listing.viewCount + 1 }));
});

router.put("/marketplace/:id", async (req, res) => {
  const paramsParsed = UpdateListingParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateListingBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (bodyParsed.data.price !== undefined) updateData.price = String(bodyParsed.data.price);
  if (bodyParsed.data.status !== undefined) updateData.status = bodyParsed.data.status;
  if (bodyParsed.data.description !== undefined) updateData.description = bodyParsed.data.description;

  const [updated] = await db
    .update(listingsTable)
    .set(updateData as Parameters<typeof db.update>[0] extends never ? never : never)
    .where(eq(listingsTable.id, paramsParsed.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (bodyParsed.data.status === "sold" || bodyParsed.data.status === "cancelled") {
    await db
      .update(cardsTable)
      .set({ forSale: false, listingPrice: null })
      .where(eq(cardsTable.id, updated.cardId));
  }

  res.json(await enrichListing(updated));
});

router.delete("/cards/:cardId/listing", async (req, res) => {
  const cardId = parseInt(req.params.cardId);
  if (isNaN(cardId)) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.cardId, cardId), eq(listingsTable.status, "active")));

  if (!listing) {
    res.status(404).json({ error: "No active listing found for this card" });
    return;
  }

  await db
    .update(listingsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(listingsTable.id, listing.id));

  await db
    .update(cardsTable)
    .set({ forSale: false, listingPrice: null })
    .where(eq(cardsTable.id, cardId));

  res.status(204).send();
});

router.delete("/marketplace/:id", async (req, res) => {
  const parsed = DeleteListingParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, parsed.data.id));
  if (listing) {
    await db
      .update(cardsTable)
      .set({ forSale: false, listingPrice: null })
      .where(eq(cardsTable.id, listing.cardId));
  }
  await db.delete(listingsTable).where(eq(listingsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
