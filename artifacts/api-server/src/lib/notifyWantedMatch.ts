import { db, activityEventsTable, wantedListingsTable, cardsTable } from "@workspace/db";
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

async function sendClerkEmail(params: {
  toClerkId: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    logger.warn("CLERK_SECRET_KEY not set — skipping email notification");
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
    logger.warn({ err, clerkId: params.toClerkId }, "Could not fetch Clerk user for email notification");
    return;
  }

  if (!emailAddressId) {
    logger.warn({ clerkId: params.toClerkId }, "No email address found for buyer — skipping email");
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
      logger.warn(
        { status: response.status, body: text, clerkId: params.toClerkId },
        "Clerk email API returned non-OK status",
      );
    } else {
      logger.info({ clerkId: params.toClerkId }, "Email notification sent via Clerk");
    }
  } catch (err) {
    logger.warn({ err, clerkId: params.toClerkId }, "Failed to send Clerk email notification");
  }
}

export async function notifyWantedListingMatches(params: {
  listingId: number;
  cardId: number;
  sellerClerkId: string;
  price: number;
}): Promise<void> {
  const { listingId, cardId, sellerClerkId, price } = params;

  const [card] = await db
    .select({ catalogCardId: cardsTable.catalogCardId, name: cardsTable.name, imageUrl: cardsTable.imageUrl })
    .from(cardsTable)
    .where(eq(cardsTable.id, cardId));

  if (!card?.catalogCardId) {
    return;
  }

  const matchingWanted = await db
    .select()
    .from(wantedListingsTable)
    .where(
      and(
        eq(wantedListingsTable.catalogCardId, card.catalogCardId),
        eq(wantedListingsTable.status, "active"),
      ),
    );

  if (matchingWanted.length === 0) {
    return;
  }

  const baseUrl = getAppBaseUrl();
  const listingUrl = `${baseUrl}/marketplace/${listingId}`;
  const cardName = card.name ?? "a card you're looking for";

  const notifiedBuyers = new Set<string>();

  for (const wanted of matchingWanted) {
    if (wanted.ownerClerkId === sellerClerkId) {
      continue;
    }

    if (notifiedBuyers.has(wanted.ownerClerkId)) {
      continue;
    }
    notifiedBuyers.add(wanted.ownerClerkId);

    try {
      await db.insert(activityEventsTable).values({
        type: "wanted_listing_match",
        clerkId: wanted.ownerClerkId,
        listingId,
        cardId,
        metadata: {
          name: cardName,
          imageUrl: card.imageUrl ?? null,
          price,
          listingUrl,
        },
      });
    } catch (err) {
      logger.warn({ err, wantedId: wanted.id }, "Failed to insert wanted_listing_match activity event");
    }

    void sendClerkEmail({
      toClerkId: wanted.ownerClerkId,
      subject: `A card you're looking for is now listed: ${cardName}`,
      bodyText: [
        `Good news! A seller just listed "${cardName}" on DexPoky — a card matching your "Looking For" request.`,
        ``,
        `Price: $${price.toFixed(2)}`,
        ``,
        `View the listing: ${listingUrl}`,
        ``,
        `Happy collecting!`,
        `— The DexPoky Team`,
      ].join("\n"),
    });
  }

  logger.info(
    { listingId, cardId, catalogCardId: card.catalogCardId, matchCount: matchingWanted.length },
    "Processed wanted listing match notifications",
  );
}
