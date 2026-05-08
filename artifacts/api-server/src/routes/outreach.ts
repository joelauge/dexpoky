import { Router } from "express";
import { z } from "zod";
import { db, inviteSendsTable, listingsTable, usersTable, cardsTable } from "@workspace/db";
import { eq, and, gte, count, avg, sql, isNull } from "drizzle-orm";
import { requireApiKey, type ApiKeyRequest } from "../middlewares/requireApiKey.js";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { sendInviteEmail } from "../lib/outreach-email.js";
import { sendInviteSms } from "../lib/outreach-sms.js";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger.js";
import type { Request, Response } from "express";

const router = Router();

const RATE_LIMIT_PER_24H = 30;

const InviteBody = z.object({
  to: z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).max(20).optional(),
    name: z.string().min(1).max(120).default("Trainer"),
  }),
  message: z.string().min(1).max(400),
  subject: z.string().min(1).max(200).optional(),
  featuredListingId: z.number().int().positive().optional(),
  ctaUrl: z.string().url().optional(),
}).refine(d => d.to.email || d.to.phone, {
  message: "At least one of to.email or to.phone is required",
});

async function getPlatformStats() {
  const [listingStats] = await db
    .select({
      listingCount: count(listingsTable.id),
      avgPrice: avg(listingsTable.price),
    })
    .from(listingsTable)
    .where(eq(listingsTable.status, "active"));

  const [userStats] = await db
    .select({ userCount: count(usersTable.id) })
    .from(usersTable);

  return {
    listingCount: listingStats?.listingCount ?? 0,
    avgPriceDollars: Math.round(Number(listingStats?.avgPrice ?? 0)),
    userCount: userStats?.userCount ?? 0,
  };
}

router.post("/outreach/invite", requireApiKey, async (req: Request, res: Response) => {
  const apiReq = req as ApiKeyRequest;
  const parsed = InviteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    return;
  }

  const { to, message, subject, featuredListingId, ctaUrl } = parsed.data;

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [rateCheck] = await db
    .select({ n: count(inviteSendsTable.id) })
    .from(inviteSendsTable)
    .where(
      and(
        eq(inviteSendsTable.apiKeyId, apiReq.apiKeyId),
        gte(inviteSendsTable.sentAt, since)
      )
    );

  if ((rateCheck?.n ?? 0) >= RATE_LIMIT_PER_24H) {
    res.status(429).json({
      error: `Rate limit exceeded: max ${RATE_LIMIT_PER_24H} invites per 24 hours per API key.`,
    });
    return;
  }

  let fromDisplayName = "A DexPoky member";
  try {
    const sender = await clerkClient.users.getUser(apiReq.apiKeyClerkId);
    fromDisplayName = sender.username ?? fromDisplayName;
  } catch {
    // non-fatal
  }

  let cardImageUrl: string | undefined;
  if (featuredListingId) {
    try {
      const [listing] = await db
        .select({ listingImages: listingsTable.listingImages })
        .from(listingsTable)
        .where(eq(listingsTable.id, featuredListingId))
        .limit(1);
      const imgs = listing?.listingImages;
      if (imgs && imgs.length > 0) cardImageUrl = imgs[0];
    } catch {
      // non-fatal
    }
  }

  const stats = await getPlatformStats();
  const finalSubject = subject ?? `${fromDisplayName} invites you to DexPoky — Pokémon card marketplace`;
  const base = process.env.REPLIT_DOMAINS
    ? `https://${process.env.REPLIT_DOMAINS.split(",")[0].trim()}`
    : "https://dexpoky.replit.app";

  // Insert the invite row first so we have an ID to derive the tracking URL.
  // We send with status "pending" and update it after delivery attempts.
  const channelLabel = [to.email && "email", to.phone && "sms"].filter(Boolean).join("+");
  const [inserted] = await db
    .insert(inviteSendsTable)
    .values({
      fromClerkId: apiReq.apiKeyClerkId,
      apiKeyId: apiReq.apiKeyId,
      toEmail: to.email ?? null,
      toPhone: to.phone ?? null,
      toName: to.name,
      subject: finalSubject,
      message,
      featuredListingId: featuredListingId ?? null,
      ctaUrl: ctaUrl ?? null,
      channel: channelLabel,
      status: "pending",
    })
    .returning();

  // Build the final CTA URL — auto-decorate with ref when no custom URL given.
  const finalCtaUrl = ctaUrl ?? `${base}?ref=dpx_${inserted.id}`;

  const channels: string[] = [];
  const errors: string[] = [];

  if (to.email) {
    try {
      await sendInviteEmail({
        toEmail: to.email,
        toName: to.name,
        subject: finalSubject,
        message,
        ctaUrl: finalCtaUrl,
        cardImageUrl,
        stats,
        fromDisplayName,
      });
      channels.push("email");
    } catch (err) {
      errors.push(`email: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (to.phone) {
    try {
      await sendInviteSms({
        toPhone: to.phone,
        message: `${fromDisplayName} invites you to DexPoky — ${message}`,
        ctaUrl: finalCtaUrl,
      });
      channels.push("sms");
    } catch (err) {
      errors.push(`sms: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Update the row with actual delivery outcome and the resolved CTA URL.
  const finalStatus = channels.length === 0 ? "failed" : errors.length > 0 ? "partial" : "sent";
  await db
    .update(inviteSendsTable)
    .set({ ctaUrl: finalCtaUrl, channel: channels.join("+") || channelLabel, status: finalStatus })
    .where(eq(inviteSendsTable.id, inserted.id));

  if (channels.length === 0) {
    res.status(502).json({ error: `All delivery channels failed: ${errors.join("; ")}` });
    return;
  }

  res.status(201).json({
    id: inserted.id,
    sentAt: inserted.sentAt,
    channels,
    ctaUrl: finalCtaUrl,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
});

router.get("/outreach/invites", requireApiKey, async (req: Request, res: Response) => {
  const apiReq = req as ApiKeyRequest;
  const invites = await db
    .select()
    .from(inviteSendsTable)
    .where(eq(inviteSendsTable.apiKeyId, apiReq.apiKeyId))
    .orderBy(sql`${inviteSendsTable.sentAt} DESC`)
    .limit(100);

  res.json(
    invites.map(i => ({
      id: i.id,
      to: { email: i.toEmail, phone: i.toPhone, name: i.toName },
      subject: i.subject,
      channel: i.channel,
      status: i.status,
      sentAt: i.sentAt,
      ctaUrl: i.ctaUrl,
      convertedAt: i.convertedAt,
    }))
  );
});

// POST /api/outreach/convert — called by the frontend after a user signs in
// when a ?ref=dpx_{id} param was present on the landing URL.
// Validates that the signed-in user's email or phone matches the invite target
// before recording the conversion, preventing cross-user forgery.
router.post("/outreach/convert", requireAuth, async (req: Request, res: Response) => {
  const clerkId = (req as AuthRequest).userId;
  const ref = typeof req.body.ref === "string" ? req.body.ref.trim() : "";
  const match = ref.match(/^dpx_(\d+)$/);
  if (!match) {
    res.status(400).json({ error: "Invalid ref format" });
    return;
  }

  const inviteId = parseInt(match[1], 10);
  const [invite] = await db
    .select({
      id: inviteSendsTable.id,
      toEmail: inviteSendsTable.toEmail,
      toPhone: inviteSendsTable.toPhone,
      convertedAt: inviteSendsTable.convertedAt,
    })
    .from(inviteSendsTable)
    .where(eq(inviteSendsTable.id, inviteId))
    .limit(1);

  if (!invite) {
    res.status(404).json({ error: "Invite not found" });
    return;
  }

  if (invite.convertedAt) {
    res.json({ alreadyConverted: true });
    return;
  }

  // Verify the signed-in user matches the invite recipient.
  // If the invite has a specific email or phone, at least one must match.
  const hasTarget = invite.toEmail || invite.toPhone;
  if (hasTarget) {
    let matchesRecipient = false;
    try {
      const clerkUser = await clerkClient.users.getUser(clerkId);
      const userEmails = clerkUser.emailAddresses.map(e => e.emailAddress.toLowerCase());
      const userPhones = clerkUser.phoneNumbers.map(p => p.phoneNumber);

      if (invite.toEmail && userEmails.includes(invite.toEmail.toLowerCase())) {
        matchesRecipient = true;
      }
      if (invite.toPhone && userPhones.some(p => p.includes(invite.toPhone!) || invite.toPhone!.includes(p))) {
        matchesRecipient = true;
      }
    } catch (err) {
      logger.error({ err, clerkId, inviteId }, "Failed to fetch Clerk user for invite conversion check");
      res.status(500).json({ error: "Could not verify recipient identity" });
      return;
    }

    if (!matchesRecipient) {
      res.status(403).json({ error: "Signed-in account does not match the invite recipient" });
      return;
    }
  }

  await db
    .update(inviteSendsTable)
    .set({ convertedAt: new Date(), convertedClerkId: clerkId })
    .where(and(eq(inviteSendsTable.id, inviteId), isNull(inviteSendsTable.convertedAt)));

  logger.info({ inviteId, clerkId }, "Invite conversion recorded");
  res.json({ converted: true });
});

export default router;
