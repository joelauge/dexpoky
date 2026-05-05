import { Router } from "express";
import { db, dmThreadsTable, dmMessagesTable, wantedListingsTable, listingsTable, cardsTable, tradeOffersTable } from "@workspace/db";
import { eq, and, or, desc, ne } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth.js";
import { logger } from "../lib/logger.js";
import { z } from "zod/v4";

const router = Router();

const StartThreadBody = z.object({
  initialMessage: z.string().trim().min(1).max(2000),
  sellerImages: z.array(z.string()).max(10).optional(),
  sellerVideo: z.string().optional(),
  askingPrice: z.number().nonnegative().optional(),
});

const SendMessageBody = z.object({
  content: z.string().trim().min(1).max(2000),
});

async function getDisplayInfo(clerkId: string): Promise<{ displayName: string | null; imageUrl: string | null }> {
  try {
    const user = await clerkClient.users.getUser(clerkId);
    const displayName =
      user.username ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      null;
    return { displayName, imageUrl: user.imageUrl ?? null };
  } catch (err) {
    logger.warn({ err, clerkId }, "Failed to fetch Clerk user for messaging");
    return { displayName: null, imageUrl: null };
  }
}

router.post("/wanted/:id/thread", requireAuth, async (req, res) => {
  const wantedId = parseInt(String(req.params.id), 10);
  if (isNaN(wantedId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const sellerClerkId = (req as AuthRequest).userId;

  const parsed = StartThreadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [wanted] = await db
    .select()
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.id, wantedId));

  if (!wanted) {
    res.status(404).json({ error: "Wanted listing not found" });
    return;
  }

  if (wanted.ownerClerkId === sellerClerkId) {
    res.status(403).json({ error: "You cannot message yourself" });
    return;
  }

  const buyerClerkId = wanted.ownerClerkId;

  const existing = await db
    .select()
    .from(dmThreadsTable)
    .where(
      and(
        eq(dmThreadsTable.wantedListingId, wantedId),
        eq(dmThreadsTable.sellerClerkId, sellerClerkId),
      ),
    );

  let thread = existing[0];

  if (!thread) {
    const [created] = await db
      .insert(dmThreadsTable)
      .values({
        wantedListingId: wantedId,
        buyerClerkId,
        sellerClerkId,
      })
      .returning();
    thread = created;
  }

  await db.insert(dmMessagesTable).values({
    threadId: thread.id,
    senderClerkId: sellerClerkId,
    content: parsed.data.initialMessage,
  });

  await db
    .update(dmThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(dmThreadsTable.id, thread.id));

  // Create or update trade offer if seller included images/video or an asking price
  const { sellerImages, sellerVideo, askingPrice } = parsed.data;
  if (sellerImages?.length || sellerVideo || askingPrice != null) {
    const [existingOffer] = await db
      .select()
      .from(tradeOffersTable)
      .where(eq(tradeOffersTable.threadId, thread.id));

    if (!existingOffer) {
      await db.insert(tradeOffersTable).values({
        threadId: thread.id,
        sellerClerkId,
        sellerImages: sellerImages ?? [],
        sellerVideo: sellerVideo ?? null,
        askingPrice: askingPrice != null ? String(askingPrice) : null,
        status: "pending",
      });
    } else {
      await db
        .update(tradeOffersTable)
        .set({
          sellerImages: sellerImages ?? existingOffer.sellerImages,
          sellerVideo: sellerVideo ?? existingOffer.sellerVideo,
          askingPrice: askingPrice != null ? String(askingPrice) : existingOffer.askingPrice,
          updatedAt: new Date(),
        })
        .where(eq(tradeOffersTable.id, existingOffer.id));
    }
  }

  res.json(thread);
});

/* ── Start or resume a counter-offer thread for a marketplace listing ────── */
router.post("/marketplace/:id/thread", requireAuth, async (req, res) => {
  const listingId = parseInt(String(req.params.id), 10);
  if (isNaN(listingId)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const buyerClerkId = (req as AuthRequest).userId;

  const parsed = z.object({
    initialMessage: z.string().trim().min(1).max(2000),
    offerAmount: z.number().nonnegative().optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [listingRow] = await db
    .select({
      id: listingsTable.id,
      sellerClerkId: listingsTable.sellerClerkId,
      cardName: cardsTable.name,
    })
    .from(listingsTable)
    .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
    .where(eq(listingsTable.id, listingId))
    .limit(1);

  if (!listingRow) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const sellerClerkId = listingRow.sellerClerkId;
  if (!sellerClerkId) {
    res.status(400).json({ error: "Listing has no seller" });
    return;
  }

  if (sellerClerkId === buyerClerkId) {
    res.status(403).json({ error: "You cannot message yourself" });
    return;
  }

  // Find or create thread
  const existing = await db
    .select()
    .from(dmThreadsTable)
    .where(
      and(
        eq(dmThreadsTable.listingId, listingId),
        eq(dmThreadsTable.buyerClerkId, buyerClerkId),
      ),
    )
    .limit(1);

  let thread = existing[0];

  if (!thread) {
    const [created] = await db
      .insert(dmThreadsTable)
      .values({
        listingId,
        buyerClerkId,
        sellerClerkId,
      })
      .returning();
    thread = created;
  }

  const { initialMessage, offerAmount } = parsed.data;
  const messageContent = offerAmount != null
    ? `Counter Offer: ${offerAmount.toLocaleString("en-US", { style: "currency", currency: "USD" })}\n\n${initialMessage}`
    : initialMessage;

  await db.insert(dmMessagesTable).values({
    threadId: thread.id,
    senderClerkId: buyerClerkId,
    content: messageContent,
  });

  await db
    .update(dmThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(dmThreadsTable.id, thread.id));

  res.json({ threadId: thread.id });
});

router.get("/threads", requireAuth, async (req, res) => {
  const userId = (req as AuthRequest).userId;

  const threads = await db
    .select()
    .from(dmThreadsTable)
    .where(
      or(
        eq(dmThreadsTable.buyerClerkId, userId),
        eq(dmThreadsTable.sellerClerkId, userId),
      ),
    )
    .orderBy(desc(dmThreadsTable.updatedAt));

  const results = await Promise.all(
    threads.map(async (thread) => {
      const otherClerkId =
        thread.buyerClerkId === userId ? thread.sellerClerkId : thread.buyerClerkId;
      const role = thread.buyerClerkId === userId ? "buyer" : "seller";

      const messages = await db
        .select()
        .from(dmMessagesTable)
        .where(eq(dmMessagesTable.threadId, thread.id))
        .orderBy(desc(dmMessagesTable.createdAt))
        .limit(1);

      const lastMessage = messages[0] ?? null;

      const unreadCount = await db.$count(
        dmMessagesTable,
        and(
          eq(dmMessagesTable.threadId, thread.id),
          eq(dmMessagesTable.isRead, false),
          ne(dmMessagesTable.senderClerkId, userId),
        ),
      );

      // Wanted-listing-based thread
      let wantedCardName: string | null = null;
      let wantedCardImageUrl: string | null = null;
      if (thread.wantedListingId != null) {
        const [wanted] = await db
          .select({
            id: wantedListingsTable.id,
            name: wantedListingsTable.name,
            imageUrl: wantedListingsTable.imageUrl,
          })
          .from(wantedListingsTable)
          .where(eq(wantedListingsTable.id, thread.wantedListingId));
        wantedCardName = wanted?.name ?? null;
        wantedCardImageUrl = wanted?.imageUrl ?? null;
      }

      // Listing-based thread (counter-offer)
      let listingCardName: string | null = null;
      let listingCardImageUrl: string | null = null;
      if (thread.listingId != null) {
        const [lr] = await db
          .select({ cardName: cardsTable.name, cardImage: cardsTable.imageUrl })
          .from(listingsTable)
          .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
          .where(eq(listingsTable.id, thread.listingId));
        listingCardName = lr?.cardName ?? null;
        listingCardImageUrl = lr?.cardImage ?? null;
      }

      const otherUserInfo = await getDisplayInfo(otherClerkId);

      return {
        id: thread.id,
        wantedListingId: thread.wantedListingId,
        listingId: thread.listingId,
        wantedCardName: wantedCardName ?? listingCardName,
        wantedCardImageUrl: wantedCardImageUrl ?? listingCardImageUrl,
        role,
        otherUserId: otherClerkId,
        otherUserDisplayName: otherUserInfo.displayName,
        otherUserImageUrl: otherUserInfo.imageUrl,
        lastMessage: lastMessage
          ? { content: lastMessage.content, createdAt: lastMessage.createdAt, senderClerkId: lastMessage.senderClerkId }
          : null,
        unreadCount,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      };
    }),
  );

  res.json(results);
});

router.get("/threads/:threadId/messages", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) {
    res.status(400).json({ error: "Invalid threadId" });
    return;
  }

  const userId = (req as AuthRequest).userId;

  const [thread] = await db
    .select()
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.id, threadId));

  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  if (thread.buyerClerkId !== userId && thread.sellerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const msgs = await db
    .select()
    .from(dmMessagesTable)
    .where(eq(dmMessagesTable.threadId, threadId))
    .orderBy(dmMessagesTable.createdAt);

  res.json(msgs);
});

router.post("/threads/:threadId/messages", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) {
    res.status(400).json({ error: "Invalid threadId" });
    return;
  }

  const userId = (req as AuthRequest).userId;

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body" });
    return;
  }

  const [thread] = await db
    .select()
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.id, threadId));

  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  if (thread.buyerClerkId !== userId && thread.sellerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [msg] = await db
    .insert(dmMessagesTable)
    .values({
      threadId,
      senderClerkId: userId,
      content: parsed.data.content,
    })
    .returning();

  await db
    .update(dmThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(dmThreadsTable.id, threadId));

  res.status(201).json(msg);
});

router.post("/threads/:threadId/read", requireAuth, async (req, res) => {
  const threadId = parseInt(String(req.params.threadId), 10);
  if (isNaN(threadId)) {
    res.status(400).json({ error: "Invalid threadId" });
    return;
  }

  const userId = (req as AuthRequest).userId;

  const [thread] = await db
    .select()
    .from(dmThreadsTable)
    .where(eq(dmThreadsTable.id, threadId));

  if (!thread) {
    res.status(404).json({ error: "Thread not found" });
    return;
  }

  if (thread.buyerClerkId !== userId && thread.sellerClerkId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await db
    .update(dmMessagesTable)
    .set({ isRead: true })
    .where(
      and(
        eq(dmMessagesTable.threadId, threadId),
        eq(dmMessagesTable.isRead, false),
        ne(dmMessagesTable.senderClerkId, userId),
      ),
    );

  res.status(204).send();
});

export default router;
