import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, listingsTable, activityEventsTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";

const router = Router();

router.get("/inventory/stats", async (req, res) => {
  const [totals] = await db
    .select({
      totalCards: sql<number>`count(*)::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
      forSaleCount: sql<number>`count(*) filter (where ${cardsTable.forSale} = true)::int`,
      forSaleValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric) filter (where ${cardsTable.forSale} = true), 0)::float`,
    })
    .from(cardsTable);

  const [listingStats] = await db
    .select({ totalListings: sql<number>`count(*)::int` })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"));

  const [{ categoryCount }] = await db
    .select({ categoryCount: sql<number>`count(*)::int` })
    .from(categoriesTable);

  const rarityRows = await db
    .select({
      rarity: cardsTable.rarity,
      count: sql<number>`count(*)::int`,
    })
    .from(cardsTable)
    .groupBy(cardsTable.rarity);

  const conditionRows = await db
    .select({
      condition: cardsTable.condition,
      count: sql<number>`count(*)::int`,
    })
    .from(cardsTable)
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

router.get("/inventory/value-by-category", async (req, res) => {
  const rows = await db
    .select({
      categoryId: cardsTable.categoryId,
      categoryName: categoriesTable.name,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .groupBy(cardsTable.categoryId, categoriesTable.name)
    .orderBy(sql`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0) desc`);

  const result = rows.map((r) => ({
    ...r,
    categoryName: r.categoryName ?? "Uncategorized",
  }));
  res.json(result);
});

router.get("/inventory/recent-activity", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 10), 50);

  const events = await db
    .select()
    .from(activityEventsTable)
    .orderBy(desc(activityEventsTable.createdAt))
    .limit(limit);

  res.json(events);
});

export default router;
