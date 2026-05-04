import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sellerPayoutsTable, usersTable, cardsTable, categoriesTable, listingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { syncAllUsersFromClerk } from "../lib/userSync.js";
import bootstrapDump from "../data/bootstrap-import.json" with { type: "json" };

const router = Router();

function getAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdmin(clerkId: string): Promise<boolean> {
  if (getAdminIds().includes(clerkId)) return true;
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return false;
  const [u] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.clerkId, clerkId));
  if (!u?.email) return false;
  return adminEmails.includes(u.email.toLowerCase());
}

async function requireAdmin(req: AuthRequest, res: import("express").Response, next: import("express").NextFunction) {
  if (!(await isAdmin(req.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get("/admin/me", requireAuth, async (req, res) => {
  res.json({ isAdmin: await isAdmin((req as AuthRequest).userId) });
});

router.post("/admin/sync-users", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next).catch(next), async (_req, res) => {
  const result = await syncAllUsersFromClerk();
  res.json(result);
});

router.get("/admin/payouts", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next).catch(next), async (req, res) => {
  const status = (req.query.status as string | undefined) ?? "pending";
  const entries = await db
    .select()
    .from(sellerPayoutsTable)
    .where(and(eq(sellerPayoutsTable.kind, "payout_request"), eq(sellerPayoutsTable.status, status)))
    .orderBy(desc(sellerPayoutsTable.createdAt));

  const sellerIds = Array.from(new Set(entries.map(e => e.sellerClerkId)));
  const sellers = sellerIds.length
    ? await Promise.all(
        sellerIds.map(async id => {
          const [u] = await db.select().from(usersTable).where(eq(usersTable.clerkId, id));
          return u;
        })
      )
    : [];
  const sellerMap = new Map(sellers.filter(Boolean).map(u => [u!.clerkId, u!]));

  res.json(
    entries.map(e => ({
      ...e,
      seller: sellerMap.get(e.sellerClerkId)
        ? {
            clerkId: e.sellerClerkId,
            username: sellerMap.get(e.sellerClerkId)!.username,
          }
        : { clerkId: e.sellerClerkId, username: null },
    }))
  );
});

const MarkPaidBody = z.object({
  note: z.string().max(500).optional(),
});

router.post("/admin/payouts/:id/mark-paid", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next).catch(next), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = MarkPaidBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [entry] = await db.select().from(sellerPayoutsTable).where(eq(sellerPayoutsTable.id, id));
  if (!entry) {
    res.status(404).json({ error: "Payout not found" });
    return;
  }
  if (entry.kind !== "payout_request") {
    res.status(400).json({ error: "Not a payout request" });
    return;
  }
  if (entry.status !== "pending") {
    res.status(400).json({ error: `Already ${entry.status}` });
    return;
  }

  const [updated] = await db
    .update(sellerPayoutsTable)
    .set({
      status: "completed",
      note: parsed.data.note ? `${entry.note ?? ""}${entry.note ? " · " : ""}${parsed.data.note}` : entry.note,
    })
    .where(eq(sellerPayoutsTable.id, id))
    .returning();

  res.json(updated);
});

router.post("/admin/payouts/:id/cancel", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next).catch(next), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [entry] = await db.select().from(sellerPayoutsTable).where(eq(sellerPayoutsTable.id, id));
  if (!entry || entry.kind !== "payout_request" || entry.status !== "pending") {
    res.status(400).json({ error: "Cannot cancel" });
    return;
  }

  const [updated] = await db
    .update(sellerPayoutsTable)
    .set({ status: "cancelled" })
    .where(eq(sellerPayoutsTable.id, id))
    .returning();

  res.json(updated);
});

router.post(
  "/admin/import-bootstrap",
  requireAuth,
  (req, res, next) => requireAdmin(req as AuthRequest, res, next).catch(next),
  async (req, res) => {
    const userId = (req as AuthRequest).userId;
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";

    type DumpCategory = {
      id: number; name: string; description: string | null; color: string | null;
      created_at: string; updated_at: string; owner_clerk_id: string;
    };
    type DumpCard = {
      id: number; name: string; pokemon_name: string; set_name: string | null; card_number: string | null;
      rarity: string; condition: string; image_url: string | null;
      estimated_value: string | number | null; acquired_date: string | null;
      category_id: number | null; for_sale: boolean; listing_price: string | number | null;
      notes: string | null; created_at: string; updated_at: string; owner_clerk_id: string;
    };
    type DumpListing = {
      id: number; card_id: number; price: string | number; status: string;
      description: string | null; view_count: number; created_at: string; updated_at: string;
      seller_clerk_id: string | null; listing_type: string;
      buy_now_price: string | number | null; reserve_price: string | number | null;
      starting_bid: string | number | null; current_bid: string | number | null;
      current_bidder_clerk_id: string | null; min_bid_increment: string | number | null;
      auction_end_time: string | null;
    };
    const dump = bootstrapDump as unknown as {
      ownerClerkId: string;
      categories: DumpCategory[];
      cards: DumpCard[];
      listings: DumpListing[];
    };

    const targetOwner = dump.ownerClerkId;

    const existingCards = await db
      .select({ id: cardsTable.id })
      .from(cardsTable)
      .where(eq(cardsTable.ownerClerkId, targetOwner));
    const existingCats = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.ownerClerkId, targetOwner));

    if (existingCards.length > 0 || existingCats.length > 0) {
      res.status(409).json({
        error: "Target owner already has data — refusing to import",
        existingCards: existingCards.length,
        existingCategories: existingCats.length,
      });
      return;
    }

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldInsert: {
          categories: dump.categories.length,
          cards: dump.cards.length,
          listings: dump.listings.length,
        },
        targetOwner,
        invokedBy: userId,
      });
      return;
    }

    const categoryIdMap = new Map<number, number>();
    for (const c of dump.categories) {
      const [inserted] = await db
        .insert(categoriesTable)
        .values({
          ownerClerkId: targetOwner,
          name: c.name,
          description: c.description,
          color: c.color,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
        })
        .returning({ id: categoriesTable.id });
      categoryIdMap.set(c.id, inserted.id);
    }

    const cardIdMap = new Map<number, number>();
    for (const c of dump.cards) {
      const [inserted] = await db
        .insert(cardsTable)
        .values({
          ownerClerkId: targetOwner,
          name: c.name,
          pokemonName: c.pokemon_name,
          setName: c.set_name,
          cardNumber: c.card_number,
          rarity: c.rarity,
          condition: c.condition,
          imageUrl: c.image_url,
          estimatedValue: c.estimated_value != null ? String(c.estimated_value) : null,
          acquiredDate: c.acquired_date ? new Date(c.acquired_date) : null,
          categoryId: c.category_id != null ? categoryIdMap.get(c.category_id) ?? null : null,
          forSale: c.for_sale,
          listingPrice: c.listing_price != null ? String(c.listing_price) : null,
          notes: c.notes,
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
        })
        .returning({ id: cardsTable.id });
      cardIdMap.set(c.id, inserted.id);
    }

    let listingsInserted = 0;
    for (const l of dump.listings) {
      const newCardId = cardIdMap.get(l.card_id);
      if (newCardId == null) continue;
      await db.insert(listingsTable).values({
        cardId: newCardId,
        sellerClerkId: targetOwner,
        listingType: l.listing_type as "buy_now" | "auction",
        price: String(l.price),
        buyNowPrice: l.buy_now_price != null ? String(l.buy_now_price) : null,
        reservePrice: l.reserve_price != null ? String(l.reserve_price) : null,
        startingBid: l.starting_bid != null ? String(l.starting_bid) : null,
        currentBid: l.current_bid != null ? String(l.current_bid) : null,
        currentBidderClerkId: l.current_bidder_clerk_id,
        minBidIncrement: l.min_bid_increment != null ? String(l.min_bid_increment) : null,
        auctionEndTime: l.auction_end_time ? new Date(l.auction_end_time) : null,
        status: l.status,
        description: l.description,
        viewCount: l.view_count,
        createdAt: new Date(l.created_at),
        updatedAt: new Date(l.updated_at),
      });
      listingsInserted++;
    }

    res.json({
      ok: true,
      inserted: {
        categories: categoryIdMap.size,
        cards: cardIdMap.size,
        listings: listingsInserted,
      },
      targetOwner,
      invokedBy: userId,
    });
  },
);

export default router;
