import { Router } from "express";
import { db, wantedListingsTable } from "@workspace/db";
import { eq, and, or, ilike } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";

const router = Router();

function serializeWanted(row: typeof wantedListingsTable.$inferSelect) {
  return {
    ...row,
    maxPrice: row.maxPrice != null ? parseFloat(String(row.maxPrice)) : null,
  };
}

router.get("/wanted", async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;

  let rows = await db
    .select()
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.status, "active"))
    .orderBy(wantedListingsTable.createdAt);

  if (search) {
    const s = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(s) ||
        r.pokemonName.toLowerCase().includes(s) ||
        (r.setName ?? "").toLowerCase().includes(s),
    );
  }

  res.json(rows.map(serializeWanted));
});

router.post("/wanted", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;
  const { catalogCardId, name, pokemonName, setName, setCode, cardNumber, rarity, imageUrl, maxPrice, notes } =
    req.body as Record<string, unknown>;

  if (!catalogCardId || typeof catalogCardId !== "string") {
    res.status(400).json({ error: "catalogCardId is required" });
    return;
  }
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (!pokemonName || typeof pokemonName !== "string") {
    res.status(400).json({ error: "pokemonName is required" });
    return;
  }

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
      name: String(name),
      pokemonName: String(pokemonName),
      setName: typeof setName === "string" ? setName : null,
      setCode: typeof setCode === "string" ? setCode : null,
      cardNumber: typeof cardNumber === "string" ? cardNumber : null,
      rarity: typeof rarity === "string" ? rarity : null,
      imageUrl: typeof imageUrl === "string" ? imageUrl : null,
      maxPrice: typeof maxPrice === "number" ? String(maxPrice) : null,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
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
