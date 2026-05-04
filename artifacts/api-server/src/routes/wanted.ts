import { Router } from "express";
import { db, wantedListingsTable } from "@workspace/db";
import { eq, ilike, desc, or, and } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";
import { CreateWantedListingBody } from "@workspace/api-zod";

const router = Router();

function serializeWanted(row: typeof wantedListingsTable.$inferSelect) {
  return {
    ...row,
    maxPrice: row.maxPrice != null ? parseFloat(String(row.maxPrice)) : null,
  };
}

router.get("/wanted", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

  const statusFilter = eq(wantedListingsTable.status, "active");
  const whereClause = search
    ? and(
        statusFilter,
        or(
          ilike(wantedListingsTable.name, `%${search}%`),
          ilike(wantedListingsTable.pokemonName, `%${search}%`),
          ilike(wantedListingsTable.setName, `%${search}%`),
        ),
      )
    : statusFilter;

  const rows = await db
    .select()
    .from(wantedListingsTable)
    .where(whereClause)
    .orderBy(desc(wantedListingsTable.createdAt))
    .limit(24);

  res.json(rows.map(serializeWanted));
});

router.post("/wanted", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const parsed = CreateWantedListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const { catalogCardId, name, pokemonName, setName, setCode, cardNumber, rarity, imageUrl, maxPrice, notes } =
    parsed.data;

  let ownerDisplayName: string | null = null;
  let ownerImageUrl: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    ownerDisplayName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
      clerkUser.username ||
      null;
    ownerImageUrl = clerkUser.imageUrl ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "Failed to fetch Clerk user for wanted listing");
  }

  const [row] = await db
    .insert(wantedListingsTable)
    .values({
      ownerClerkId: userId,
      ownerDisplayName,
      ownerImageUrl,
      catalogCardId,
      name,
      pokemonName,
      setName: setName ?? null,
      setCode: setCode ?? null,
      cardNumber: cardNumber ?? null,
      rarity: rarity ?? null,
      imageUrl: imageUrl ?? null,
      maxPrice: maxPrice != null ? String(maxPrice) : null,
      notes: notes?.trim() || null,
      status: "active",
    })
    .returning();

  res.status(201).json(serializeWanted(row));
});

router.delete("/wanted/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = (req as AuthRequest).userId;

  const [row] = await db
    .select({ id: wantedListingsTable.id, ownerClerkId: wantedListingsTable.ownerClerkId })
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.ownerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db.delete(wantedListingsTable).where(eq(wantedListingsTable.id, id));

  res.status(204).send();
});

export default router;
