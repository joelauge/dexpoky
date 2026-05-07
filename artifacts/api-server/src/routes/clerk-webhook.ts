import { createHmac, timingSafeEqual } from "crypto";
import { db, inviteSendsTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import type { Request, Response } from "express";

const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
const isDev = process.env.NODE_ENV === "development";

function verifySignature(rawBody: Buffer, req: Request): boolean {
  if (!WEBHOOK_SECRET) return false;
  const svixId = req.headers["svix-id"] as string | undefined;
  const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
  const svixSignature = req.headers["svix-signature"] as string | undefined;
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const signedContent = `${svixId}.${svixTimestamp}.${rawBody.toString()}`;
  const secret = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const expectedSig = createHmac("sha256", secret).update(signedContent).digest("base64");

  const signatures = svixSignature.split(" ").map(s => s.replace(/^v1,/, ""));
  return signatures.some(sig => {
    try {
      return timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expectedSig, "base64"));
    } catch {
      return false;
    }
  });
}

export async function clerkWebhookHandler(req: Request, res: Response): Promise<void> {
  const rawBody = req.body as Buffer;

  if (!WEBHOOK_SECRET) {
    if (!isDev) {
      res.status(503).json({ error: "Webhook secret not configured" });
      return;
    }
  } else if (!verifySignature(rawBody, req)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let payload: { type: string; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody.toString()) as typeof payload;
  } catch {
    res.status(400).json({ error: "Invalid JSON payload" });
    return;
  }

  const { type, data } = payload;

  if (type === "user.created") {
    const clerkId = data.id as string | undefined;
    const meta = (data.unsafe_metadata ?? data.unsafeMetadata ?? {}) as Record<string, unknown>;
    const inviteRef = meta.invite_ref as string | undefined;

    if (clerkId && inviteRef) {
      const match = inviteRef.match(/^dpx_(\d+)$/);
      if (match) {
        const inviteId = parseInt(match[1], 10);
        try {
          await db
            .update(inviteSendsTable)
            .set({ convertedAt: new Date(), convertedClerkId: clerkId })
            .where(and(eq(inviteSendsTable.id, inviteId), isNull(inviteSendsTable.convertedAt)));
          logger.info({ inviteId, clerkId }, "Invite conversion recorded via webhook");
        } catch (err) {
          logger.error({ err, inviteId, clerkId }, "Failed to record invite conversion");
        }
      }
    }
  }

  res.json({ received: true });
}
