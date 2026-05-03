import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sellerPayoutsTable, usersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";

const router = Router();

function getAdminIds(): string[] {
  return (process.env.ADMIN_CLERK_IDS ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
}

function isAdmin(clerkId: string): boolean {
  const ids = getAdminIds();
  return ids.includes(clerkId);
}

function requireAdmin(req: AuthRequest, res: import("express").Response, next: import("express").NextFunction) {
  if (!isAdmin(req.userId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.get("/admin/me", requireAuth, (req, res) => {
  res.json({ isAdmin: isAdmin((req as AuthRequest).userId) });
});

router.get("/admin/payouts", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next), async (req, res) => {
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

router.post("/admin/payouts/:id/mark-paid", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next), async (req, res) => {
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

router.post("/admin/payouts/:id/cancel", requireAuth, (req, res, next) => requireAdmin(req as AuthRequest, res, next), async (req, res) => {
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

export default router;
