import { Router } from "express";
import { db, groupSharesTable, groupShareCardsTable, cardsTable, categoriesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod/v4";

const router = Router();

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function generateCode(len = 7): string {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

const CreateGroupShareBody = z.object({
  title: z.string().trim().max(120).optional(),
  askingPrice: z.number().nonnegative().optional(),
  shippingCost: z.number().nonnegative().optional(),
  cards: z.array(z.object({
    cardId: z.number().int().positive(),
    images: z.array(z.string()).max(10).default([]),
    video: z.string().optional(),
  })).min(2).max(50),
});

/* ── POST /api/group-shares — create a group share ────────────────────────── */
router.post("/group-shares", requireAuth, async (req, res) => {
  const clerkId = (req as AuthRequest).userId;
  const parsed = CreateGroupShareBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", issues: parsed.error.issues });
    return;
  }

  const { title, askingPrice, shippingCost, cards } = parsed.data;

  let code = generateCode();
  // Ensure uniqueness
  for (let i = 0; i < 5; i++) {
    const existing = await db.select({ id: groupSharesTable.id })
      .from(groupSharesTable)
      .where(eq(groupSharesTable.code, code))
      .limit(1);
    if (!existing.length) break;
    code = generateCode();
  }

  const [groupShare] = await db.insert(groupSharesTable).values({
    code,
    title: title ?? null,
    askingPrice: askingPrice != null ? String(askingPrice) : null,
    shippingCost: shippingCost != null ? String(shippingCost) : null,
    clerkId,
  }).returning();

  if (cards.length > 0) {
    await db.insert(groupShareCardsTable).values(
      cards.map((c, idx) => ({
        groupShareId: groupShare.id,
        cardId: c.cardId,
        images: c.images,
        video: c.video ?? null,
        displayOrder: idx,
      }))
    );
  }

  res.status(201).json({ code, id: groupShare.id, url: `/view/group/${code}` });
});

/* ── GET /api/group-shares/:code — fetch group share (public) ─────────────── */
router.get("/group-shares/:code", async (req, res) => {
  const { code } = req.params;

  const [groupShare] = await db.select()
    .from(groupSharesTable)
    .where(eq(groupSharesTable.code, code))
    .limit(1);

  if (!groupShare) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const shareCards = await db.select()
    .from(groupShareCardsTable)
    .where(eq(groupShareCardsTable.groupShareId, groupShare.id))
    .orderBy(groupShareCardsTable.displayOrder);

  const cardIds = shareCards.map(sc => sc.cardId);
  const cardRows = cardIds.length > 0
    ? await db.select({
        id: cardsTable.id,
        name: cardsTable.name,
        pokemonName: cardsTable.pokemonName,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        rarity: cardsTable.rarity,
        condition: cardsTable.condition,
        imageUrl: cardsTable.imageUrl,
        estimatedValue: cardsTable.estimatedValue,
        categoryId: cardsTable.categoryId,
      })
      .from(cardsTable)
      .where(inArray(cardsTable.id, cardIds))
    : [];

  const cardMap = new Map(cardRows.map(c => [c.id, c]));

  const cards = shareCards.map(sc => ({
    ...sc,
    card: cardMap.get(sc.cardId) ?? null,
  }));

  res.json({
    id: groupShare.id,
    code: groupShare.code,
    title: groupShare.title,
    askingPrice: groupShare.askingPrice,
    shippingCost: groupShare.shippingCost,
    clerkId: groupShare.clerkId,
    createdAt: groupShare.createdAt,
    cards,
  });
});

export default router;
