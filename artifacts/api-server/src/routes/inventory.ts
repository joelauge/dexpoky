import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, categoriesTable, listingsTable } from "@workspace/db";
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
  const cards = await db
    .select({
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
    })
    .from(cardsTable)
    .leftJoin(categoriesTable, eq(categoriesTable.id, cardsTable.categoryId))
    .orderBy(desc(cardsTable.createdAt))
    .limit(limit);

  res.json(cards);
});

export default router;
