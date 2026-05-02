import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, cardsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  GetCategoryParams,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/categories", async (req, res) => {
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      color: categoriesTable.color,
      createdAt: categoriesTable.createdAt,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(categoriesTable)
    .leftJoin(cardsTable, eq(cardsTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id)
    .orderBy(categoriesTable.name);

  res.json(categories);
});

router.post("/categories", async (req, res) => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }
  const [category] = await db
    .insert(categoriesTable)
    .values(parsed.data)
    .returning();
  res.status(201).json({ ...category, cardCount: 0, totalValue: 0 });
});

router.get("/categories/:id", async (req, res) => {
  const parsed = GetCategoryParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [category] = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      color: categoriesTable.color,
      createdAt: categoriesTable.createdAt,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(categoriesTable)
    .leftJoin(cardsTable, eq(cardsTable.categoryId, categoriesTable.id))
    .where(eq(categoriesTable.id, parsed.data.id))
    .groupBy(categoriesTable.id);

  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(category);
});

router.put("/categories/:id", async (req, res) => {
  const paramsParsed = UpdateCategoryParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateCategoryBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const [updated] = await db
    .update(categoriesTable)
    .set({ ...bodyParsed.data, updatedAt: new Date() })
    .where(eq(categoriesTable.id, paramsParsed.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const [withStats] = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      description: categoriesTable.description,
      color: categoriesTable.color,
      createdAt: categoriesTable.createdAt,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(categoriesTable)
    .leftJoin(cardsTable, eq(cardsTable.categoryId, categoriesTable.id))
    .where(eq(categoriesTable.id, paramsParsed.data.id))
    .groupBy(categoriesTable.id);
  res.json(withStats);
});

router.delete("/categories/:id", async (req, res) => {
  const parsed = DeleteCategoryParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(categoriesTable).where(eq(categoriesTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
