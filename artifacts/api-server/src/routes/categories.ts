import { Router } from "express";
import { db } from "@workspace/db";
import { categoriesTable, cardsTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  CreateCategoryBody,
  UpdateCategoryBody,
  GetCategoryParams,
  UpdateCategoryParams,
  DeleteCategoryParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/categories", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
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
    .leftJoin(
      cardsTable,
      and(eq(cardsTable.categoryId, categoriesTable.id), eq(cardsTable.ownerClerkId, userId)),
    )
    .where(eq(categoriesTable.ownerClerkId, userId))
    .groupBy(categoriesTable.id)
    .orderBy(categoriesTable.name);

  res.json(categories);
});

router.post("/categories", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error });
    return;
  }
  const [category] = await db
    .insert(categoriesTable)
    .values({ ...parsed.data, ownerClerkId: userId })
    .returning();
  res.status(201).json({ ...category, cardCount: 0, totalValue: 0 });
});

router.get("/categories/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
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
      ownerClerkId: categoriesTable.ownerClerkId,
      cardCount: sql<number>`count(${cardsTable.id})::int`,
      totalValue: sql<number>`coalesce(sum(${cardsTable.estimatedValue}::numeric), 0)::float`,
    })
    .from(categoriesTable)
    .leftJoin(
      cardsTable,
      and(eq(cardsTable.categoryId, categoriesTable.id), eq(cardsTable.ownerClerkId, userId)),
    )
    .where(eq(categoriesTable.id, parsed.data.id))
    .groupBy(categoriesTable.id);

  if (!category || category.ownerClerkId !== userId) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  const { ownerClerkId: _o, ...rest } = category;
  res.json(rest);
});

router.put("/categories/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const paramsParsed = UpdateCategoryParams.safeParse({ id: Number(req.params.id) });
  const bodyParsed = UpdateCategoryBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const [existing] = await db
    .select({ ownerClerkId: categoriesTable.ownerClerkId })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, paramsParsed.data.id));
  if (!existing || existing.ownerClerkId !== userId) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const [updated] = await db
    .update(categoriesTable)
    .set({ ...bodyParsed.data, updatedAt: new Date() })
    .where(eq(categoriesTable.id, paramsParsed.data.id))
    .returning();

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
    .leftJoin(
      cardsTable,
      and(eq(cardsTable.categoryId, categoriesTable.id), eq(cardsTable.ownerClerkId, userId)),
    )
    .where(eq(categoriesTable.id, updated.id))
    .groupBy(categoriesTable.id);
  res.json(withStats);
});

router.delete("/categories/:id", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const parsed = DeleteCategoryParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select({ ownerClerkId: categoriesTable.ownerClerkId })
    .from(categoriesTable)
    .where(eq(categoriesTable.id, parsed.data.id));
  if (!existing || existing.ownerClerkId !== userId) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  await db.delete(categoriesTable).where(eq(categoriesTable.id, parsed.data.id));
  res.status(204).send();
});

export default router;
