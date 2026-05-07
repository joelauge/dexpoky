import { Router } from "express";
import { createHash, randomBytes } from "crypto";
import { eq, and, isNull } from "drizzle-orm";
import { db, apiKeysTable } from "@workspace/db";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { z } from "zod";
import type { Request, Response } from "express";

const router = Router();

const MAX_KEYS_PER_USER = 5;

function generateKey(): { raw: string; hash: string; prefix: string } {
  const bytes = randomBytes(32).toString("hex");
  const raw = `dpx_${bytes}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  return { raw, hash, prefix };
}

router.get("/developer/keys", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      keyPrefix: apiKeysTable.keyPrefix,
      createdAt: apiKeysTable.createdAt,
      lastUsedAt: apiKeysTable.lastUsedAt,
      revokedAt: apiKeysTable.revokedAt,
    })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.clerkId, clerkId))
    .orderBy(apiKeysTable.createdAt);

  res.json(keys);
});

const CreateKeyBody = z.object({
  name: z.string().min(1).max(64).default("Default"),
});

router.post("/developer/keys", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;

  const parsed = CreateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const active = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.clerkId, clerkId), isNull(apiKeysTable.revokedAt)));

  if (active.length >= MAX_KEYS_PER_USER) {
    res.status(400).json({ error: `You can have at most ${MAX_KEYS_PER_USER} active API keys.` });
    return;
  }

  const { raw, hash, prefix } = generateKey();

  const [created] = await db
    .insert(apiKeysTable)
    .values({ clerkId, name: parsed.data.name, keyHash: hash, keyPrefix: prefix })
    .returning();

  res.status(201).json({
    id: created.id,
    name: created.name,
    keyPrefix: created.keyPrefix,
    createdAt: created.createdAt,
    lastUsedAt: null,
    revokedAt: null,
    key: raw,
  });
});

router.delete("/developer/keys/:id", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [key] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.clerkId, clerkId)));

  if (!key) { res.status(404).json({ error: "Key not found" }); return; }
  if (key.revokedAt) { res.status(400).json({ error: "Key already revoked" }); return; }

  const [updated] = await db
    .update(apiKeysTable)
    .set({ revokedAt: new Date() })
    .where(eq(apiKeysTable.id, id))
    .returning();

  res.json({
    id: updated.id,
    name: updated.name,
    keyPrefix: updated.keyPrefix,
    createdAt: updated.createdAt,
    lastUsedAt: updated.lastUsedAt,
    revokedAt: updated.revokedAt,
  });
});

export default router;
