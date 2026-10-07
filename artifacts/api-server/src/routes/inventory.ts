import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, listingsTable, activityEventsTable, shortLinksTable, dmThreadsTable, wishlistItemsTable, bindersTable, binderPagesTable, binderSlotsTable } from "@workspace/db";
import { GetPortfolioBreakdownsQueryParams, GetPortfolioBreakdownsResponse } from "@workspace/api-zod";
import { eq, sql, desc, and, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { visibleActivityTypes } from "../lib/activity-visibility.js";
import { buildPortfolioBreakdowns } from "../lib/portfolio-breakdowns.js";
import { loadPortfolioMetadata } from "../lib/portfolio-catalog-metadata.js";

const router = Router();

router.get("/inventory/portfolio-breakdowns", requireAuth, async (req, res) => {
  const parsed = GetPortfolioBreakdownsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid portfolio dimension" });
    return;
  }
  const userId = (req as AuthRequest).userId;
  const [cards, wishlist, memberships] = await Promise.all([
    db.select({
      id: cardsTable.id, pokemonName: cardsTable.pokemonName,
      setId: cardsTable.setId, setName: cardsTable.setName, catalogCardId: cardsTable.catalogCardId,
      categoryId: cardsTable.categoryId, categoryName: categoriesTable.name,
      estimatedValue: cardsTable.estimatedValue, forSale: cardsTable.forSale,
      rarity: cardsTable.rarity, condition: cardsTable.condition,
    }).from(cardsTable)
      .leftJoin(categoriesTable, and(eq(categoriesTable.id, cardsTable.categoryId), eq(categoriesTable.ownerClerkId, userId)))
      .where(eq(cardsTable.ownerClerkId, userId)),
    db.select({
      id: wishlistItemsTable.id, setName: wishlistItemsTable.setName,
      setCode: wishlistItemsTable.setCode, lastSeenPrice: wishlistItemsTable.lastSeenPrice,
    }).from(wishlistItemsTable).where(eq(wishlistItemsTable.ownerClerkId, userId)),
    db.selectDistinct({
      cardId: cardsTable.id, binderId: bindersTable.id, binderName: bindersTable.name,
    }).from(binderSlotsTable)
      .innerJoin(binderPagesTable, eq(binderPagesTable.id, binderSlotsTable.pageId))
      .innerJoin(bindersTable, eq(bindersTable.id, binderPagesTable.binderId))
      .innerJoin(cardsTable, eq(cardsTable.id, binderSlotsTable.cardId))
      .where(and(eq(bindersTable.ownerClerkId, userId), eq(cardsTable.ownerClerkId, userId))),
  ]);
  const metadata = await loadPortfolioMetadata(cards, parsed.data.dimension ?? "category");
  res.json(GetPortfolioBreakdownsResponse.parse(buildPortfolioBreakdowns(cards, wishlist, memberships, metadata)));
});

router.get("/inventory/stats", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const [totals] = await db
    .select({
      totalCards: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
      forSaleCount: sql<number>`count(*) filter (where ${cardsTable.forSale} = true)::int`,
      forSaleValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric) filter (where ${cardsTable.forSale} = true), 0)::float`,
    })
    .from(cardsTable)
    .where(eq(cardsTable.ownerClerkId, userId));

  const [listingStats] = await db
    .select({ totalListings: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(and(eq(listingsTable.status, "active"), eq(listingsTable.sellerClerkId, userId)));

  const [{ categoryCount }] = await db
    .select({ categoryCount: sql<number>`count(*)::int` })
    .from(categoriesTable)
    .where(eq(categoriesTable.ownerClerkId, userId));

  const rarityRows = await db
    .select({
      rarity: cardsTable.rarity,
      count: sql<number>`count(*)::int`,
    })
    .from(cardsTable)
    .where(eq(cardsTable.ownerClerkId, userId))
    .groupBy(cardsTable.rarity);

  const conditionRows = await db
    .select({
      condition: cardsTable.condition,
      count: sql<number>`count(*)::int`,
    })
    .from(cardsTable)
    .where(eq(cardsTable.ownerClerkId, userId))
    .groupBy(cardsTable.condition);

  const rarityBreakdown = Object.fromEntries(
    rarityRows.map((r) => [r.rarity, r.count]),
  );
  const conditionBreakdown = Object.fromEntries(
    conditionRows.map((r) => [r.condition, r.count]),
  );

  res.json({
    ...totals,
    totalListings: listingStats?.totalListings ?? 0,
    categoryCount: categoryCount ?? 0,
    rarityBreakdown,
    conditionBreakdown,
  });
});

router.get("/inventory/value-by-category", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const rows = await db
    .select({
      categoryId: cardsTable.categoryId,
      categoryName: categoriesTable.name,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .where(eq(cardsTable.ownerClerkId, userId))
    .groupBy(cardsTable.categoryId, categoriesTable.name)
    .orderBy(sql`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0) desc`);

  const result = rows.map((r) => ({
    ...r,
    categoryName: r.categoryName ?? "Uncategorized",
  }));
  res.json(result);
});

router.get("/inventory/recent-activity", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const limit = Math.min(Number(req.query.limit ?? 10), 50);

  const events = await db
    .select()
    .from(activityEventsTable)
    .where(and(
      eq(activityEventsTable.clerkId, userId),
      inArray(activityEventsTable.type, visibleActivityTypes),
    ))
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit);

  res.json(events);
});

router.get("/inventory/trading-stats", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const [listingAgg] = await db
    .select({
      activeListings: sql<number>`count(*) filter (where ${listingsTable.status} = 'active')::int`,
      soldListings:   sql<number>`count(*) filter (where ${listingsTable.status} = 'sold')::int`,
      totalRevenue:   sql<number>`coalesce(sum(${listingsTable.price}::numeric) filter (where ${listingsTable.status} = 'sold'), 0)::float`,
      totalViews:     sql<number>`coalesce(sum(${listingsTable.viewCount}), 0)::int`,
    })
    .from(listingsTable)
    .where(eq(listingsTable.sellerClerkId, userId));

  const [{ linksShared }] = await db
    .select({ linksShared: sql<number>`count(*)::int` })
    .from(shortLinksTable)
    .where(eq(shortLinksTable.clerkId, userId));

  const [{ offersIn }] = await db
    .select({ offersIn: sql<number>`count(*)::int` })
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.sellerClerkId, userId));

  res.json({
    activeListings: listingAgg?.activeListings ?? 0,
    soldListings:   listingAgg?.soldListings   ?? 0,
    totalRevenue:   listingAgg?.totalRevenue   ?? 0,
    totalViews:     listingAgg?.totalViews     ?? 0,
    linksShared:    linksShared  ?? 0,
    offersIn:       offersIn     ?? 0,
  });
});

type LinkKind = "private" | "marketplace" | "looking_for" | "collection";

function parseLinkMeta(targetUrl: string): { linkKind: LinkKind; cardId: number | null; listingId: number | null } {
  try {
    const path = new URL(targetUrl).pathname;
    const cardMatch = path.match(/\/view\/card\/(\d+)/) ?? path.match(/\/api\/og\/card\/(\d+)/);
    if (cardMatch) return { linkKind: "private", cardId: parseInt(cardMatch[1]), listingId: null };
    const listingMatch = path.match(/\/view\/listing\/(\d+)/) ?? path.match(/\/api\/og\/listing\/(\d+)/);
    if (listingMatch) return { linkKind: "marketplace", cardId: null, listingId: parseInt(listingMatch[1]) };
    if (path.includes("/api/og/w/") || path.includes("/view/w/")) return { linkKind: "looking_for", cardId: null, listingId: null };
  } catch { /* ignore */ }
  return { linkKind: "collection", cardId: null, listingId: null };
}

router.get("/inventory/my-shares", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const listings = await db
    .select({
      id: listingsTable.id,
      listingType: listingsTable.listingType,
      status: listingsTable.status,
      price: listingsTable.price,
      viewCount: listingsTable.viewCount,
      createdAt: listingsTable.createdAt,
      auctionEndTime: listingsTable.auctionEndTime,
      cardId: cardsTable.id,
      cardName: cardsTable.name,
      cardImageUrl: cardsTable.imageUrl,
      cardSetName: cardsTable.setName,
    })
    .from(listingsTable)
    .leftJoin(cardsTable, eq(cardsTable.id, listingsTable.cardId))
    .where(eq(listingsTable.sellerClerkId, userId))
    .orderBy(desc(listingsTable.createdAt))
    .limit(30);

  const rawLinks = await db
    .select()
    .from(shortLinksTable)
    .where(eq(shortLinksTable.clerkId, userId))
    .orderBy(desc(shortLinksTable.createdAt))
    .limit(30);

  // Parse each link to extract card/listing IDs for batch enrichment
  const parsed = rawLinks.map(link => ({ link, meta: parseLinkMeta(link.targetUrl) }));
  const cardIds = [...new Set(parsed.flatMap(p => p.meta.cardId != null ? [p.meta.cardId] : []))];
  const listingIds = [...new Set(parsed.flatMap(p => p.meta.listingId != null ? [p.meta.listingId] : []))];

  const [cardRows, listingCardRows] = await Promise.all([
    cardIds.length > 0
      ? db.select({ id: cardsTable.id, name: cardsTable.name, imageUrl: cardsTable.imageUrl })
          .from(cardsTable).where(inArray(cardsTable.id, cardIds))
      : Promise.resolve([]),
    listingIds.length > 0
      ? db.select({ listingId: listingsTable.id, name: cardsTable.name, imageUrl: cardsTable.imageUrl })
          .from(listingsTable)
          .leftJoin(cardsTable, eq(cardsTable.id, listingsTable.cardId))
          .where(inArray(listingsTable.id, listingIds))
      : Promise.resolve([]),
  ]);

  const cardMap = new Map(cardRows.map(r => [r.id, r]));
  const listingCardMap = new Map(listingCardRows.map(r => [r.listingId, r]));

  const shortLinks = parsed.map(({ link, meta }) => {
    let cardName: string | null = null;
    let cardImageUrl: string | null = null;
    if (meta.cardId != null) {
      const c = cardMap.get(meta.cardId);
      cardName = c?.name ?? null;
      cardImageUrl = c?.imageUrl ?? null;
    } else if (meta.listingId != null) {
      const r = listingCardMap.get(meta.listingId);
      cardName = r?.name ?? null;
      cardImageUrl = r?.imageUrl ?? null;
    }
    return { ...link, linkKind: meta.linkKind, cardName, cardImageUrl };
  });

  res.json({ listings, shortLinks });
});

router.delete("/inventory/short-links/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [link] = await db.select().from(shortLinksTable).where(eq(shortLinksTable.id, id)).limit(1);
  if (!link) { res.status(404).json({ error: "Not found" }); return; }
  if (link.clerkId !== userId) { res.status(403).json({ error: "Not yours" }); return; }

  await db.delete(shortLinksTable).where(eq(shortLinksTable.id, id));
  res.status(204).send();
});

export default router;
