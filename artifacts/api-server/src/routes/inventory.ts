import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, listingsTable, activityEventsTable, shortLinksTable, dmThreadsTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";

const router = Router();

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
    .where(eq(activityEventsTable.clerkId, userId))
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

export default router;
