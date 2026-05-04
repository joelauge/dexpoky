import { Router } from "express";
import { db } from "@workspace/db";
import { listingsTable, cardsTable, categoriesTable, activityEventsTable, sellerPayoutsTable } from "@workspace/db";
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
import { getUncachableStripeClient } from "../stripeClient.js";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";

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

router.post("/marketplace", requireAuth, async (req, res) => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }

  const sellerClerkId = (req as AuthRequest).userId;

  const [card] = await db
    .select({ ownerClerkId: cardsTable.ownerClerkId })
    .from(cardsTable)
    .where(eq(cardsTable.id, parsed.data.cardId));
  if (!card) {
    res.status(404).json({ error: "Card not found" });
    return;
  }
  if (card.ownerClerkId !== sellerClerkId) {
    res.status(403).json({ error: "You can only list cards you own" });
    return;
  }

  const listingType = req.body.listingType === "auction" ? "auction" : "buy_now";

  const listingImages = Array.isArray(req.body.listingImages)
    ? (req.body.listingImages as string[]).slice(0, 10)
    : null;

  const values: Record<string, unknown> = {
    cardId: parsed.data.cardId,
    price: String(parsed.data.price),
    description: parsed.data.description ?? null,
    listingImages,
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

  const enriched = await enrichListing(listing);

  await db.insert(activityEventsTable).values({
    type: "listing_created",
    clerkId: sellerClerkId,
    cardId: parsed.data.cardId,
    listingId: listing.id,
    metadata: {
      name: enriched.card?.name ?? null,
      imageUrl: enriched.card?.imageUrl ?? null,
      price: parseFloat(String(listing.price)),
      listingType,
    },
  });

  res.status(201).json(enriched);
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

router.put("/marketplace/:id", requireAuth, async (req, res) => {
  const paramsParsed = UpdateListingParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateListingBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const clerkId = (req as AuthRequest).userId;

  const [existingListing] = await db
    .select({ sellerClerkId: listingsTable.sellerClerkId })
    .from(listingsTable)
    .where(eq(listingsTable.id, paramsParsed.data.id));
  if (!existingListing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (existingListing.sellerClerkId !== clerkId) {
    res.status(403).json({ error: "You can only edit your own listings" });
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

  const enriched = await enrichListing(updated);

  if (bodyParsed.data.status === "sold" || bodyParsed.data.status === "cancelled") {
    await db.insert(activityEventsTable).values({
      type: bodyParsed.data.status === "sold" ? "listing_sold" : "listing_cancelled",
      clerkId,
      cardId: updated.cardId,
      listingId: updated.id,
      metadata: {
        name: enriched.card?.name ?? null,
        imageUrl: enriched.card?.imageUrl ?? null,
        price: parseFloat(String(updated.price)),
        listingType: updated.listingType,
      },
    });
  }

  res.json(enriched);
});

router.get("/cards/:cardId/listing", async (req, res) => {
  const cardId = parseInt(req.params.cardId);
  if (isNaN(cardId)) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }
  const [listing] = await db
    .select({
      id: listingsTable.id,
      listingType: listingsTable.listingType,
      price: listingsTable.price,
      status: listingsTable.status,
      createdAt: listingsTable.createdAt,
    })
    .from(listingsTable)
    .where(and(eq(listingsTable.cardId, cardId), eq(listingsTable.status, "active")));

  if (!listing) {
    res.status(404).json({ error: "No active listing found" });
    return;
  }
  res.json({ ...listing, price: parseFloat(String(listing.price)) });
});

router.delete("/cards/:cardId/listing", requireAuth, async (req, res) => {
  const cardId = parseInt(String(req.params.cardId), 10);
  if (isNaN(cardId)) {
    res.status(400).json({ error: "Invalid card id" });
    return;
  }

  const clerkId = (req as AuthRequest).userId;

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.cardId, cardId), eq(listingsTable.status, "active")));

  if (!listing) {
    res.status(404).json({ error: "No active listing found for this card" });
    return;
  }
  if (listing.sellerClerkId !== clerkId) {
    res.status(403).json({ error: "You can only cancel your own listings" });
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

  const [card] = await db
    .select({ name: cardsTable.name, imageUrl: cardsTable.imageUrl })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  await db.insert(activityEventsTable).values({
    type: "listing_cancelled",
    clerkId,
    cardId,
    listingId: listing.id,
    metadata: {
      name: card?.name ?? null,
      imageUrl: card?.imageUrl ?? null,
      price: parseFloat(String(listing.price)),
      listingType: listing.listingType,
    },
  });

  res.status(204).send();
});

router.post("/marketplace/:id/checkout", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }
  const buyerClerkId = (req as AuthRequest).userId;
  const { mode } = (req.body ?? {}) as { mode?: "buy_now" | "fixed_price" };

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, id));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.status !== "active") {
    res.status(400).json({ error: "Listing is not active" });
    return;
  }
  if (listing.sellerClerkId === buyerClerkId) {
    res.status(400).json({ error: "You cannot purchase your own listing" });
    return;
  }
  if (listing.auctionEndTime && new Date(listing.auctionEndTime) < new Date()) {
    res.status(400).json({ error: "Auction has ended" });
    return;
  }

  let amountUsd: number;
  if (listing.listingType === "auction") {
    if (!listing.buyNowPrice) {
      res.status(400).json({ error: "This auction has no Buy Now price" });
      return;
    }
    amountUsd = parseFloat(String(listing.buyNowPrice));
  } else {
    amountUsd = parseFloat(String(listing.price));
  }

  const [card] = await db
    .select({ name: cardsTable.name, imageUrl: cardsTable.imageUrl, pokemonName: cardsTable.pokemonName })
    .from(cardsTable)
    .where(eq(cardsTable.id, listing.cardId));

  const stripe = await getUncachableStripeClient();
  const origin = `${req.protocol}://${req.get("host")}`;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(amountUsd * 100),
          product_data: {
            name: card?.name ?? "Pokémon Card",
            description: card?.pokemonName ?? undefined,
            images: card?.imageUrl ? [card.imageUrl] : undefined,
          },
        },
      },
    ],
    metadata: {
      kind: "marketplace_purchase",
      listingId: String(listing.id),
      buyerClerkId,
      sellerClerkId: listing.sellerClerkId ?? "",
      mode: mode ?? (listing.listingType === "auction" ? "buy_now" : "fixed_price"),
    },
    success_url: `${origin}/marketplace/${listing.id}?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/marketplace/${listing.id}?purchase=cancelled`,
  });

  res.json({ url: session.url });
});

router.post("/marketplace/:id/confirm-purchase", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { sessionId } = (req.body ?? {}) as { sessionId?: string };
  if (!Number.isFinite(id) || !sessionId) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const buyerClerkId = (req as AuthRequest).userId;

  const stripe = await getUncachableStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== "paid") {
    res.status(400).json({ error: "Payment not completed", payment_status: session.payment_status });
    return;
  }
  if (session.metadata?.listingId !== String(id) || session.metadata?.buyerClerkId !== buyerClerkId) {
    res.status(403).json({ error: "Session does not match this listing/buyer" });
    return;
  }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  if (listing.status === "sold") {
    res.json({ ok: true, alreadyMarked: true });
    return;
  }

  const [updated] = await db
    .update(listingsTable)
    .set({ status: "sold", updatedAt: new Date() })
    .where(eq(listingsTable.id, id))
    .returning();

  await db
    .update(cardsTable)
    .set({ forSale: false, listingPrice: null })
    .where(eq(cardsTable.id, updated.cardId));

  const [card] = await db
    .select({ name: cardsTable.name, imageUrl: cardsTable.imageUrl })
    .from(cardsTable)
    .where(eq(cardsTable.id, updated.cardId));

  await db.insert(activityEventsTable).values({
    type: "listing_sold",
    clerkId: buyerClerkId,
    cardId: updated.cardId,
    listingId: updated.id,
    metadata: {
      name: card?.name ?? null,
      imageUrl: card?.imageUrl ?? null,
      price: parseFloat(String(updated.price)),
      listingType: updated.listingType,
      stripeSessionId: sessionId,
    },
  });

  if (updated.sellerClerkId) {
    const grossCents = Math.round(parseFloat(String(updated.price)) * 100);
    const platformFeeCents = Math.round(grossCents * 0.1);
    const netCents = grossCents - platformFeeCents;
    await db.insert(sellerPayoutsTable).values({
      sellerClerkId: updated.sellerClerkId,
      kind: "sale_credit",
      amountCents: netCents,
      status: "completed",
      listingId: updated.id,
      stripeSessionId: sessionId,
      note: `Sale of ${card?.name ?? "card"} ($${(grossCents / 100).toFixed(2)} − 10% fee)`,
    });
  }

  res.json({ ok: true });
});

router.delete("/marketplace/:id", requireAuth, async (req, res) => {
  const parsed = DeleteListingParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const clerkId = (req as AuthRequest).userId;
  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(eq(listingsTable.id, parsed.data.id));
  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (listing.sellerClerkId !== clerkId) {
    res.status(403).json({ error: "You can only delete your own listings" });
    return;
  }
  await db
    .update(cardsTable)
    .set({ forSale: false, listingPrice: null })
    .where(eq(cardsTable.id, listing.cardId));
  await db.delete(listingsTable).where(eq(listingsTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
