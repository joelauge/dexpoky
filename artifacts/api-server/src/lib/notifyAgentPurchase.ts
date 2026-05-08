import { db, dmThreadsTable, dmMessagesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { logger } from "./logger.js";

function getAppBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  return "https://dexpoky.replit.app";
}

async function sendClerkEmail(toClerkId: string, subject: string, bodyText: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — skipping agent purchase email");
    return;
  }

  let emailAddressId: string | null = null;
  try {
    const user = await clerkClient.users.getUser(toClerkId);
    const primary =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
      user.emailAddresses[0];
    emailAddressId = primary?.id ?? null;
  } catch (err) {
    logger.warn({ err, clerkId: toClerkId }, "Could not fetch Clerk user for agent purchase email");
    return;
  }

  if (!emailAddressId) return;

  try {
    const res = await fetch("https://api.clerk.com/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address_id: emailAddressId,
        from_email_name: "noreply",
        subject,
        body: bodyText,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      logger.warn({ status: res.status, body: text }, "Clerk email non-OK for agent purchase");
    } else {
      logger.info({ clerkId: toClerkId }, "Agent purchase email sent");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to send agent purchase email");
  }
}

async function upsertThread(listingId: number, buyerClerkId: string, sellerClerkId: string): Promise<number> {
  const existing = await db
    .select({ id: dmThreadsTable.id })
    .from(dmThreadsTable)
    .where(and(eq(dmThreadsTable.listingId, listingId), eq(dmThreadsTable.buyerClerkId, buyerClerkId)))
    .then((r) => r[0] ?? null);

  if (existing) return existing.id;

  const [created] = await db
    .insert(dmThreadsTable)
    .values({ listingId, buyerClerkId, sellerClerkId })
    .returning({ id: dmThreadsTable.id });
  return created.id;
}

export async function notifyAgentPurchase(params: {
  buyerClerkId: string;
  sellerClerkId: string;
  agentName: string;
  cardName: string;
  pricePathUsd: string;
  listingId: number;
  txHash?: string;
}): Promise<void> {
  const { buyerClerkId, sellerClerkId, agentName, cardName, pricePathUsd, listingId, txHash } = params;
  const baseUrl = getAppBaseUrl();
  const explorerBase = "https://explore.testnet.tempo.xyz";

  // ── 1. Inbox thread + messages ──────────────────────────────────────────────
  try {
    const threadId = await upsertThread(listingId, buyerClerkId, sellerClerkId);
    const now = new Date();

    const txLine = txHash
      ? `\nTx: ${explorerBase}/tx/${txHash}`
      : "";

    // Buyer notification (sent as buyer so it appears in their inbox)
    await db.insert(dmMessagesTable).values({
      threadId,
      senderClerkId: buyerClerkId,
      content: `🤖 Your DexAgent "${agentName}" automatically purchased **${cardName}** for ${pricePathUsd} pathUSD on Tempo Testnet.${txLine}\n\nThe card has been added to your collection.`,
    });

    // Seller notification (sent as seller so seller sees it too)
    await db.insert(dmMessagesTable).values({
      threadId,
      senderClerkId: sellerClerkId,
      content: `🤖 A DexPoky buyer agent purchased **${cardName}** from your listing for ${pricePathUsd} pathUSD.${txLine}`,
    });

    await db
      .update(dmThreadsTable)
      .set({ updatedAt: now })
      .where(eq(dmThreadsTable.id, threadId));

    logger.info({ threadId, buyerClerkId, cardName }, "Agent purchase inbox notification created");
  } catch (err) {
    logger.warn({ err }, "Failed to create agent purchase inbox notification");
  }

  // ── 2. Email to buyer ───────────────────────────────────────────────────────
  const txInfo = txHash ? `\nTransaction: ${explorerBase}/tx/${txHash}` : "";
  void sendClerkEmail(
    buyerClerkId,
    `🤖 DexAgent bought "${cardName}" — ${pricePathUsd} pathUSD`,
    [
      `Great news! Your DexAgent "${agentName}" automatically purchased "${cardName}" for ${pricePathUsd} pathUSD on Tempo Testnet.`,
      txInfo,
      ``,
      `The card has been added to your collection.`,
      ``,
      `View your inbox: ${baseUrl}/inbox`,
      `Manage your agents: ${baseUrl}/agents`,
      ``,
      `— The DexPoky Team`,
    ]
      .filter((l) => l !== null)
      .join("\n"),
  );
}
