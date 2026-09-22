import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import { db, cardsTable, collectionsTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import {
  CreateCollectionBody,
  UpdateCollectionBody,
  GetCollectionParams,
  UpdateCollectionParams,
  DeleteCollectionParams,
} from "@workspace/api-zod";

const router = Router();

const collectionSelect = {
  id: collectionsTable.id,
  name: collectionsTable.name,
  description: collectionsTable.description,
  createdAt: collectionsTable.createdAt,
  updatedAt: collectionsTable.updatedAt,
  cardCount: sql<number>`count(${cardsTable.id})::int`,
};

router.get("/collections", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).userId;
  const rows = await db.select(collectionSelect)
    .from(collectionsTable)
    .leftJoin(cardsTable, and(eq(cardsTable.collectionId, collectionsTable.id), eq(cardsTable.ownerClerkId, userId)))
    .where(eq(collectionsTable.ownerClerkId, userId))
    .groupBy(collectionsTable.id)
    .orderBy(collectionsTable.name);
  res.json(rows);
});

router.post("/collections", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCollectionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request body", details: parsed.error }); return; }
  const userId = (req as AuthRequest).userId;
  const [row] = await db.insert(collectionsTable).values({ ...parsed.data, ownerClerkId: userId }).returning();
  res.status(201).json({ ...row, cardCount: 0 });
});

router.get("/collections/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetCollectionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = (req as AuthRequest).userId;
  const [row] = await db.select(collectionSelect).from(collectionsTable)
    .leftJoin(cardsTable, and(eq(cardsTable.collectionId, collectionsTable.id), eq(cardsTable.ownerClerkId, userId)))
    .where(and(eq(collectionsTable.id, parsed.data.id), eq(collectionsTable.ownerClerkId, userId)))
    .groupBy(collectionsTable.id);
  if (!row) { res.status(404).json({ error: "Collection not found" }); return; }
  res.json(row);
});

router.put("/collections/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateCollectionParams.safeParse({ id: Number(req.params.id) });
  const body = UpdateCollectionBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid request" }); return; }
  const userId = (req as AuthRequest).userId;
  const [updated] = await db.update(collectionsTable).set({ ...body.data, updatedAt: new Date() })
    .where(and(eq(collectionsTable.id, params.data.id), eq(collectionsTable.ownerClerkId, userId))).returning();
  if (!updated) { res.status(404).json({ error: "Collection not found" }); return; }
  const [row] = await db.select(collectionSelect).from(collectionsTable)
    .leftJoin(cardsTable, and(eq(cardsTable.collectionId, updated.id), eq(cardsTable.ownerClerkId, userId)))
    .where(eq(collectionsTable.id, updated.id)).groupBy(collectionsTable.id);
  res.json(row);
});

router.delete("/collections/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteCollectionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = (req as AuthRequest).userId;
  const deleted = await db.delete(collectionsTable)
    .where(and(eq(collectionsTable.id, parsed.data.id), eq(collectionsTable.ownerClerkId, userId))).returning({ id: collectionsTable.id });
  if (!deleted.length) { res.status(404).json({ error: "Collection not found" }); return; }
  res.status(204).send();
});

export default router;