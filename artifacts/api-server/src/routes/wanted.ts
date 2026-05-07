import { Router } from "express";
import { randomBytes } from "crypto";
import { db, wantedListingsTable } from "@workspace/db";
import { eq, ilike, desc, or, and, isNull, gt, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";
import { CreateWantedListingBody, UpdateWantedListingBody } from "@workspace/api-zod";

const router = Router();

function generateShortCode(): string {
  return randomBytes(4).toString("hex");
}

async function uniqueShortCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateShortCode();
    const [existing] = await db
      .select({ id: wantedListingsTable.id })
      .from(wantedListingsTable)
      .where(eq(wantedListingsTable.shortCode, code));
    if (!existing) return code;
  }
  throw new Error("Failed to generate unique short code");
}

function serializeWanted(row: typeof wantedListingsTable.$inferSelect) {
  // ownerDisplayName is guaranteed to be a username (no spaces) by the DB
  // check constraint on wanted_listings. No runtime filtering is needed here.
  return {
    ...row,
    maxPrice: row.maxPrice != null ? parseFloat(String(row.maxPrice)) : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

const activeNotExpired = and(
  eq(wantedListingsTable.status, "active"),
  or(isNull(wantedListingsTable.expiresAt), gt(wantedListingsTable.expiresAt, sql`NOW()`)),
);

router.get("/wanted", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

  const publicFilter = and(activeNotExpired, eq(wantedListingsTable.isPublic, true));

  const whereClause = search
    ? and(
        publicFilter,
        or(
          ilike(wantedListingsTable.name, `%${search}%`),
          ilike(wantedListingsTable.pokemonName, `%${search}%`),
          ilike(wantedListingsTable.setName, `%${search}%`),
        ),
      )
    : publicFilter;

  const rows = await db
    .select()
    .from(wantedListingsTable)
    .where(whereClause)
    .orderBy(desc(wantedListingsTable.createdAt))
    .limit(24);

  res.json(rows.map(serializeWanted));
});

router.get("/wanted/mine", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const rows = await db
    .select()
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.ownerClerkId, userId))
    .orderBy(desc(wantedListingsTable.createdAt));

  res.json(rows.map(serializeWanted));
});

router.get("/wanted/by-code/:code", async (req, res) => {
  const { code } = req.params;
  const [row] = await db
    .select()
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.shortCode, code));

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(serializeWanted(row));
});

router.post("/wanted", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const parsed = CreateWantedListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  const { catalogCardId, name, pokemonName, setName, setCode, cardNumber, rarity, imageUrl, maxPrice, notes, isPublic, expiresAt } =
    parsed.data;

  let ownerDisplayName: string | null = null;
  let ownerImageUrl: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    ownerDisplayName = clerkUser.username || null;
    ownerImageUrl = clerkUser.imageUrl ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "Failed to fetch Clerk user for wanted listing");
  }

  const shortCode = await uniqueShortCode();

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
      shortCode,
      isPublic: isPublic !== undefined ? isPublic : true,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  res.status(201).json(serializeWanted(row));
});

router.patch("/wanted/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const userId = (req as AuthRequest).userId;

  const parsed = UpdateWantedListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }


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

  const [updated] = await db
    .update(wantedListingsTable)
    .set({ status: parsed.data.status })
    .where(eq(wantedListingsTable.id, id))
    .returning();

  res.json(serializeWanted(updated));
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
