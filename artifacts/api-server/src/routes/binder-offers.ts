import { and, eq, inArray } from "drizzle-orm";
import { db, bindersTable, binderPagesTable, binderSlotsTable, cardsTable, wishlistItemsTable,
  dmThreadsTable, dmMessagesTable, tradeOffersTable, type OfferHistoryEntry, type OfferedCard } from "@workspace/db";
import type { ContactBinderWishlistBody } from "@workspace/api-zod";
import type { z } from "zod";

type Input = { token: string; pageId: string; slot: number; sender: string; body: z.infer<typeof ContactBinderWishlistBody> };
const money = (value: number) => Math.round(value * 100) / 100;

/** Binder offers use the same negotiation records as Share/Sell and the Inbox. */
export async function createBinderOffer({ token, pageId, slot, sender, body }: Input) {
  const suppliedIds = [...(body.offeredCardIds ?? []), ...(body.offeredCardId === undefined ? [] : [body.offeredCardId])];
  if (suppliedIds.some(id => !Number.isSafeInteger(id) || id <= 0 || id > 2147483647)) {
    return { status: 400 as const, error: "Invalid offered card identifier" };
  }
  return db.transaction(async tx => {
    const [binder] = await tx.select().from(bindersTable)
      .where(and(eq(bindersTable.shareToken, token), eq(bindersTable.isPublic, true))).for("share");
    if (!binder) return { status: 404 as const, error: "This binder is private or unavailable" };
    if (binder.ownerClerkId === sender) return { status: 403 as const, error: "You cannot make an offer to yourself" };
    const [pocket] = await tx.select({ cardId: binderSlotsTable.cardId, wishlistId: binderSlotsTable.wishlistItemId })
      .from(binderSlotsTable).innerJoin(binderPagesTable, eq(binderPagesTable.id, binderSlotsTable.pageId))
      .where(and(eq(binderPagesTable.binderId, binder.id), eq(binderSlotsTable.pageId, pageId), eq(binderSlotsTable.slot, slot)));
    if (!pocket) return { status: 404 as const, error: "That binder pocket is no longer available" };
    const [wish] = pocket.wishlistId ? await tx.select().from(wishlistItemsTable)
      .where(and(eq(wishlistItemsTable.id, pocket.wishlistId), eq(wishlistItemsTable.ownerClerkId, binder.ownerClerkId))).for("share") : [];
    const [card] = pocket.cardId ? await tx.select().from(cardsTable)
      .where(and(eq(cardsTable.id, pocket.cardId), eq(cardsTable.ownerClerkId, binder.ownerClerkId))).for("share") : [];
    const target = wish ?? card;
    if (!target) return { status: 404 as const, error: "That card is no longer available" };
    const currentIdentity = wish ? -wish.id : card!.id;
    if (body.targetCardId !== undefined && (!Number.isSafeInteger(body.targetCardId) || body.targetCardId !== currentIdentity)) {
      return { status: 409 as const, error: "That pocket now contains a different card. Reload the binder before making an offer." };
    }
    if (card && !["buy", "trade"].includes(body.intent)) return { status: 400 as const, error: "Choose buy or trade for a card in this collection" };
    if (wish && body.intent === "buy") return { status: 400 as const, error: "This is a wanted card, not a card the owner has for sale" };
    if ((body.intent === "buy" || body.intent === "sell") && (!body.amount || money(body.amount) <= 0)) {
      return { status: 400 as const, error: "Enter an offer price greater than zero" };
    }
    if (card && body.intent === "trade" && !body.offeredCardIds?.length) {
      return { status: 400 as const, error: "Choose at least one card you own to offer in trade" };
    }
    const ownIds = [...new Set([...(body.offeredCardIds ?? []), ...(body.offeredCardId ? [body.offeredCardId] : [])])];
    if (body.offeredCardIds && new Set(body.offeredCardIds).size !== body.offeredCardIds.length) {
      return { status: 400 as const, error: "A card cannot be offered twice" };
    }
    const owned = ownIds.length ? await tx.select().from(cardsTable)
      .where(and(eq(cardsTable.ownerClerkId, sender), inArray(cardsTable.id, ownIds))).for("share") : [];
    if (owned.length !== ownIds.length) return { status: 403 as const, error: "You may only offer cards from your own collection" };
    if (owned.some(c => c.forSale)) return { status: 409 as const, error: "An offered copy is already listed for sale. Unlist it before offering it here." };
    const offeredCopy = owned.find(c => c.id === body.offeredCardId);
    if (wish) {
      if (body.intent === "sell" && !offeredCopy) return { status: 400 as const, error: "Choose the card you own to sell" };
      // Legacy gift/trade introductions remain supported, but every submitted copy
      // must be the desired printing. They cannot bypass the sale identity gate.
      const matches = (c: typeof owned[number]) => c.catalogCardId
        ? c.catalogCardId === wish.catalogCardId
        : !!c.setId && !!c.cardNumber && c.setId === wish.setCode && c.cardNumber === wish.cardNumber;
      if (owned.some(c => !matches(c))) return { status: 400 as const, error: "Choose a copy of this exact wishlist printing from your collection" };
    }
    const buyer = wish ? binder.ownerClerkId : sender;
    const seller = wish ? sender : binder.ownerClerkId;
    const [thread] = await tx.insert(dmThreadsTable).values({
      buyerClerkId: buyer, sellerClerkId: seller, binderId: binder.id,
      binderWishlistItemId: wish?.id ?? null, binderCardId: card?.id ?? null,
      binderSellerCardId: card?.id ?? offeredCopy?.id ?? null,
      binderCardName: target.name, binderCardImageUrl: target.imageUrl,
    }).onConflictDoUpdate({
      target: wish
        ? [dmThreadsTable.binderId, dmThreadsTable.binderWishlistItemId, dmThreadsTable.sellerClerkId]
        : [dmThreadsTable.binderId, dmThreadsTable.binderCardId, dmThreadsTable.buyerClerkId],
      set: { updatedAt: new Date(), binderCardName: target.name, binderCardImageUrl: target.imageUrl },
    }).returning();
    const [existing] = await tx.select().from(tradeOffersTable).where(eq(tradeOffersTable.threadId, thread.id)).for("update");
    if (existing && !["pending", "countered"].includes(existing.status)) return { status: 409 as const, error: "This conversation already has a resolved offer. Open your Inbox to review it." };
    const snapshots: OfferedCard[] = (body.offeredCardIds ?? []).map(id => {
      const c = owned.find(c => c.id === id)!;
      return { cardId: c.id, cardName: c.name, imageUrl: c.imageUrl, estimatedValue: c.estimatedValue ? Number(c.estimatedValue) : null, rarity: c.rarity, condition: c.condition };
    });
    const from = sender === buyer ? "buyer" as const : "seller" as const;
    const history = [...(existing?.offerHistory ?? [])];
    if (body.amount !== undefined || snapshots.length) history.push({
      amount: money(body.amount ?? 0), cards: snapshots, from, sentAt: new Date().toISOString(), note: body.message.trim(),
    });
    const source = card ?? offeredCopy;
    const sourceImages = [source?.imageUrl, ...(source?.media ?? []).filter(m => m.kind === "image").map(m => m.url)].filter((url): url is string => !!url);
    const sellerImages = wish ? body.sellerImages ?? sourceImages : sourceImages;
    const sellerVideo = wish ? body.sellerVideo ?? offeredCopy?.media?.find(m => m.kind === "video")?.url ?? null : card?.media?.find(m => m.kind === "video")?.url ?? null;
    const values = {
      sellerImages, sellerVideo, offerHistory: history as OfferHistoryEntry[],
      ...(existing && history.length > (existing.offerHistory?.length ?? 0) ? { status: "countered" } : {}),
      ...(body.amount !== undefined ? (from === "seller"
        ? { askingPrice: String(money(body.amount)) } : { offerAmount: String(money(body.amount)) }) : {}),
      updatedAt: new Date(),
    };
    if (existing) await tx.update(tradeOffersTable).set(values).where(eq(tradeOffersTable.id, existing.id));
    else await tx.insert(tradeOffersTable).values({ ...values, threadId: thread.id, sellerClerkId: seller, status: "pending" });
    if (offeredCopy && wish) await tx.update(dmThreadsTable).set({ binderSellerCardId: offeredCopy.id }).where(eq(dmThreadsTable.id, thread.id));
    const prefix = wish ? "Binder wishlist" : "Binder card";
    await tx.insert(dmMessagesTable).values({
      threadId: thread.id, senderClerkId: sender,
      content: `${prefix}: ${target.name} (${binder.name})\nI'd like to ${body.intent} ${wish ? "this card to you" : "this card"}${body.amount !== undefined ? ` for $${money(body.amount).toFixed(2)}` : ""}.\n\n${body.message.trim()}`,
    });
    return { status: 200 as const, threadId: thread.id };
  });
}
