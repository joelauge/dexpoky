import { createHash } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

export interface ApiKeyRequest extends Request {
  apiKeyClerkId: string;
  apiKeyId: number;
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header. Use: Bearer dpx_..." });
    return;
  }

  const raw = authHeader.slice(7).trim();
  if (!raw.startsWith("dpx_")) {
    res.status(401).json({ error: "Invalid API key format" });
    return;
  }

  const hash = createHash("sha256").update(raw).digest("hex");

  const [key] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.keyHash, hash), isNull(apiKeysTable.revokedAt)))
    .limit(1);

  if (!key) {
    res.status(401).json({ error: "Invalid or revoked API key" });
    return;
  }

  await db
    .update(apiKeysTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeysTable.id, key.id));

  (req as ApiKeyRequest).apiKeyClerkId = key.clerkId;
  (req as ApiKeyRequest).apiKeyId = key.id;
  next();
}
