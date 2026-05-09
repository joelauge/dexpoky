import { Router } from "express";
import { z } from "zod";
import { Resend } from "resend";
import { db, emailSendsTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";
import { requireApiKey, type ApiKeyRequest } from "../middlewares/requireApiKey.js";
import { logger } from "../lib/logger.js";
import type { Request, Response } from "express";

const router = Router();

const RATE_LIMIT_PER_24H = 50;

// ── Schema ────────────────────────────────────────────────────────────────────

const SendEmailBody = z.object({
  to: z.union([
    z.string().email(),
    z.array(z.string().email()).min(1).max(10),
  ]),
  subject: z.string().min(1).max(300),
  html: z.string().min(1).max(200_000).optional(),
  text: z.string().min(1).max(50_000).optional(),
  replyTo: z.string().email().optional(),
}).refine(d => d.html || d.text, {
  message: "At least one of html or text is required",
});

// ── Resend credentials (identical pattern to outreach-email.ts) ───────────────

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Email sending requires the Resend integration. Connect it from the Integrations panel."
    );
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
  );

  const data = await response.json() as { items?: { settings: { api_key?: string; from_email?: string } }[] };
  const item = data.items?.[0];

  if (!item?.settings?.api_key) {
    throw new Error(
      "Resend not connected — complete the Resend OAuth flow in the Integrations panel."
    );
  }

  return {
    apiKey: item.settings.api_key,
    fromEmail: item.settings.from_email ?? process.env.RESEND_FROM_EMAIL ?? "DexPoky <noreply@dexpoky.app>",
  };
}

// ── POST /email/send ──────────────────────────────────────────────────────────

router.post("/email/send", requireApiKey, async (req: Request, res: Response) => {
  const apiReq = req as ApiKeyRequest;

  const parsed = SendEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    return;
  }

  const { to, subject, html, text, replyTo } = parsed.data;
  const toAddresses = Array.isArray(to) ? to : [to];

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [rateCheck] = await db
    .select({ n: count(emailSendsTable.id) })
    .from(emailSendsTable)
    .where(
      and(
        eq(emailSendsTable.apiKeyId, apiReq.apiKeyId),
        gte(emailSendsTable.sentAt, since)
      )
    );

  if ((rateCheck?.n ?? 0) >= RATE_LIMIT_PER_24H) {
    res.status(429).json({
      error: `Rate limit exceeded: max ${RATE_LIMIT_PER_24H} emails per 24 hours per API key.`,
    });
    return;
  }

  let messageId: string | undefined;
  let status: "sent" | "failed" = "sent";
  let errorMessage: string | undefined;

  try {
    const { apiKey, fromEmail } = await getResendCredentials();
    const resend = new Resend(apiKey);

    const { data: sendData, error } = await resend.emails.send({
      from: fromEmail,
      to: toAddresses,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      status = "failed";
      errorMessage = error.message;
      logger.warn({ error, apiKeyId: apiReq.apiKeyId }, "Resend error on /email/send");
    } else {
      messageId = sendData?.id;
      logger.info({ messageId, toCount: toAddresses.length, apiKeyId: apiReq.apiKeyId }, "Email sent via /email/send");
    }
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ err, apiKeyId: apiReq.apiKeyId }, "Failed to send email via proxy");
  }

  const [inserted] = await db
    .insert(emailSendsTable)
    .values({
      apiKeyId: apiReq.apiKeyId,
      clerkId: apiReq.apiKeyClerkId,
      toAddresses,
      subject,
      status,
      resendMessageId: messageId ?? null,
    })
    .returning();

  if (status === "failed") {
    res.status(502).json({ error: errorMessage ?? "Email delivery failed" });
    return;
  }

  res.status(201).json({
    id: inserted.id,
    messageId,
    to: toAddresses,
    subject,
    sentAt: inserted.sentAt,
  });
});

// ── GET /email/sends ──────────────────────────────────────────────────────────

router.get("/email/sends", requireApiKey, async (req: Request, res: Response) => {
  const apiReq = req as ApiKeyRequest;
  const sends = await db
    .select()
    .from(emailSendsTable)
    .where(eq(emailSendsTable.apiKeyId, apiReq.apiKeyId))
    .orderBy(emailSendsTable.sentAt)
    .limit(100);

  res.json(sends.map(s => ({
    id: s.id,
    to: s.toAddresses,
    subject: s.subject,
    status: s.status,
    messageId: s.resendMessageId,
    sentAt: s.sentAt,
  })));
});

export default router;
