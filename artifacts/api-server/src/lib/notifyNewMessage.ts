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

async function sendClerkEmail(params: {
  toClerkId: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — skipping message email notification");
    return;
  }

  let emailAddressId: string | null = null;
  try {
    const user = await clerkClient.users.getUser(params.toClerkId);
    const primaryEmail =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ??
      user.emailAddresses[0];
    emailAddressId = primaryEmail?.id ?? null;
  } catch (err) {
    logger.warn({ err, clerkId: params.toClerkId }, "Could not fetch Clerk user for message notification");
    return;
  }

  if (!emailAddressId) {
    logger.warn({ clerkId: params.toClerkId }, "No email address found — skipping message notification");
    return;
  }

  try {
    const response = await fetch("https://api.clerk.com/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address_id: emailAddressId,
        from_email_name: "noreply",
        subject: params.subject,
        body: params.bodyText,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.warn({ status: response.status, body: text }, "Clerk email API returned non-OK for message notification");
    } else {
      logger.info({ clerkId: params.toClerkId }, "Message notification email sent");
    }
  } catch (err) {
    logger.warn({ err }, "Failed to send message notification email");
  }
}

export async function notifyNewMessage(params: {
  toClerkId: string;
  fromClerkId: string;
  threadId: number;
  preview: string;
}): Promise<void> {
  let fromDisplayName = "Someone";
  try {
    const sender = await clerkClient.users.getUser(params.fromClerkId);
    fromDisplayName =
      sender.username ??
      (sender.firstName && sender.lastName
        ? `${sender.firstName} ${sender.lastName}`
        : sender.firstName) ??
      fromDisplayName;
  } catch (err) {
    logger.warn({ err }, "Could not fetch sender info for message notification");
  }

  const baseUrl = getAppBaseUrl();
  const inboxUrl = `${baseUrl}/inbox`;
  const preview = params.preview.length > 120
    ? `${params.preview.slice(0, 120)}…`
    : params.preview;

  void sendClerkEmail({
    toClerkId: params.toClerkId,
    subject: `New message from ${fromDisplayName} on DexPoky`,
    bodyText: [
      `${fromDisplayName} sent you a message on DexPoky:`,
      ``,
      `"${preview}"`,
      ``,
      `Open your inbox to reply: ${inboxUrl}`,
      ``,
      `— The DexPoky Team`,
    ].join("\n"),
  });
}
