import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { eq } from "drizzle-orm";

const state = vi.hoisted(() => ({ tx: null as unknown }));
vi.mock("@clerk/express", async (original) => {
  const actual = await original<typeof import("@clerk/express")>();
  return { ...actual, getAuth: (req: express.Request) => ({ userId: req.header("x-test-owner") ?? null }) };
});
vi.mock("@workspace/db", async (original) => {
  const actual = await original<typeof import("@workspace/db")>();
  return { ...actual, db: new Proxy(actual.db, {
    get(target, key) {
      const current = (state.tx ?? target) as typeof target;
      const value = Reflect.get(current, key);
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) };
});
vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: express.Request & { userId?: string }, res: express.Response, next: express.NextFunction) => {
    const userId = req.header("x-test-owner");
    if (!userId) { res.status(401).json({ error: "Sign in required" }); return; }
    req.userId = userId; next();
  },
}));

import binderRouter from "./binders.js";
const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
const app = express().use(express.json()).use("/api", binderRouter);
type Tx = Parameters<Parameters<typeof actual.db.transaction>[0]>[0];

// Real storage and constraints, but every test rolls back all fixture writes.
async function isolated(run: (tx: Tx) => Promise<void>) {
  const rollback = new Error("test rollback");
  try {
    await actual.db.transaction(async tx => {
      state.tx = tx;
      try { await run(tx); } finally { state.tx = null; }
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe("public binder persistence and access", () => {
  it("shows supplementary photos safely and persists owned-card buy/trade offers with ownership checks", async () => isolated(async tx => {
    const owner = `test-owner-${randomUUID()}`, visitor = `test-visitor-${randomUUID()}`;
    const [card] = await tx.insert(actual.cardsTable).values({
      ownerClerkId: owner, name: "Owned Pikachu", pokemonName: "Pikachu", rarity: "common", condition: "near_mint",
      estimatedValue: "999.99", notes: "PRIVATE-OWNER-NOTE", catalogCardId: "test-owned-printing",
      media: [{ id: "extra", url: "https://example.com/back.jpg", kind: "image", width: 500, height: 700 }],
    }).returning();
    const [tradeCard] = await tx.insert(actual.cardsTable).values({
      ownerClerkId: visitor, name: "Offered Bulbasaur", pokemonName: "Bulbasaur", rarity: "common", condition: "near_mint",
    }).returning();
    const [binder] = await tx.insert(actual.bindersTable).values({
      ownerClerkId: owner, name: "Owned binder", style: "ring", coverColor: "#112233", isPublic: true, shareToken: randomUUID(),
    }).returning();
    const pageId = randomUUID();
    await tx.insert(actual.binderPagesTable).values({ id: pageId, binderId: binder.id, position: 0, rows: 3, columns: 3, widthMm: 250, heightMm: 310 });
    await tx.insert(actual.binderSlotsTable).values({ pageId, slot: 0, cardId: card.id });
    const url = `/api/public/binders/${binder.shareToken}/slots/${pageId}/0/thread`;
    const publicView = await request(app).get(`/api/public/binders/${binder.shareToken}`);
    expect(publicView.body.cards[0].media[0].url).toBe("https://example.com/back.jpg");
    expect(JSON.stringify(publicView.body)).not.toContain("999.99");
    expect(JSON.stringify(publicView.body)).not.toContain("PRIVATE-OWNER-NOTE");
    expect((await request(app).post(url).set("x-test-owner", owner).send({ intent: "buy", amount: 20, message: "Own card" })).status).toBe(403);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "buy", amount: 0, message: "Buy" })).status).toBe(400);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "buy", targetCardId: card.id + 100000, amount: 20, message: "Stale inspected card" })).status).toBe(409);
    const buy = await request(app).post(url).set("x-test-owner", visitor).send({ intent: "buy", targetCardId: card.id, amount: 20, message: "I'd like this card." });
    expect(buy.status).toBe(200);
    const [thread] = await tx.select().from(actual.dmThreadsTable).where(eq(actual.dmThreadsTable.id, buy.body.threadId));
    expect(thread).toMatchObject({ buyerClerkId: visitor, sellerClerkId: owner, binderCardId: card.id, binderSellerCardId: card.id });
    const [offer] = await tx.select().from(actual.tradeOffersTable).where(eq(actual.tradeOffersTable.threadId, thread.id));
    expect(offer.offerHistory?.[0]).toMatchObject({ from: "buyer", amount: 20 });
    expect(offer.sellerImages).toContain("https://example.com/back.jpg");
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", offeredCardIds: [card.id], message: "Not my card" })).status).toBe(403);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", offeredCardIds: [tradeCard.id + .5], message: "Invalid ID" })).status).toBe(400);
    await tx.update(actual.cardsTable).set({ forSale: true }).where(eq(actual.cardsTable.id, tradeCard.id));
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", offeredCardIds: [tradeCard.id], message: "Listed copy" })).status).toBe(409);
    await tx.update(actual.cardsTable).set({ forSale: false }).where(eq(actual.cardsTable.id, tradeCard.id));
    const trade = await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", amount: 5, offeredCardIds: [tradeCard.id], message: "Plus this card." });
    expect(trade.status).toBe(200);
    expect(trade.body.threadId).toBe(thread.id);
    const [updated] = await tx.select().from(actual.tradeOffersTable).where(eq(actual.tradeOffersTable.threadId, thread.id));
    expect(updated.offerHistory?.[1]).toMatchObject({ from: "buyer", amount: 5, cards: [{ cardId: tradeCard.id }] });
    expect(updated.status).toBe("countered");
    await tx.update(actual.tradeOffersTable).set({ status: "accepted" }).where(eq(actual.tradeOffersTable.id, offer.id));
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "buy", amount: 1, message: "Overwrite accepted" })).status).toBe(409);
    const [resolved] = await tx.select().from(actual.tradeOffersTable).where(eq(actual.tradeOffersTable.id, offer.id));
    expect(resolved.status).toBe("accepted");
    expect(resolved.offerHistory).toHaveLength(2);
  }));

  it("sells only the visitor's matching wishlist printing into the existing Inbox negotiation records", async () => isolated(async tx => {
    const owner = `test-owner-${randomUUID()}`, visitor = `test-visitor-${randomUUID()}`;
    const [wish] = await tx.insert(actual.wishlistItemsTable).values({ ownerClerkId: owner, catalogCardId: "exact-printing", name: "Wanted Pikachu", pokemonName: "Pikachu" }).returning();
    const [copy] = await tx.insert(actual.cardsTable).values({
      ownerClerkId: visitor, catalogCardId: "exact-printing", name: "My Pikachu", pokemonName: "Pikachu", rarity: "common", condition: "near_mint", imageUrl: "https://example.com/my-copy.jpg",
    }).returning();
    const [otherPrinting] = await tx.insert(actual.cardsTable).values({
      ownerClerkId: visitor, catalogCardId: "different-printing", name: "Another Pikachu", pokemonName: "Pikachu", rarity: "common", condition: "near_mint",
    }).returning();
    const [binder] = await tx.insert(actual.bindersTable).values({ ownerClerkId: owner, name: "Wish binder", style: "ring", coverColor: "#112233", isPublic: true, shareToken: randomUUID() }).returning();
    const pageId = randomUUID();
    await tx.insert(actual.binderPagesTable).values({ id: pageId, binderId: binder.id, position: 0, rows: 3, columns: 3, widthMm: 250, heightMm: 310 });
    await tx.insert(actual.binderSlotsTable).values({ pageId, slot: 0, wishlistItemId: wish.id });
    const url = `/api/public/binders/${binder.shareToken}/slots/${pageId}/0/thread`;
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "sell", amount: 30, message: "No owned copy" })).status).toBe(400);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "sell", amount: 30, offeredCardId: otherPrinting.id, message: "Wrong printing" })).status).toBe(400);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", offeredCardIds: [otherPrinting.id], message: "Wrong printing in trade" })).status).toBe(400);
    const sale = await request(app).post(url).set("x-test-owner", visitor).send({ intent: "sell", amount: 30, offeredCardId: copy.id, message: "My actual copy." });
    expect(sale.status).toBe(200);
    const [thread] = await tx.select().from(actual.dmThreadsTable).where(eq(actual.dmThreadsTable.id, sale.body.threadId));
    expect(thread).toMatchObject({ buyerClerkId: owner, sellerClerkId: visitor, binderWishlistItemId: wish.id, binderSellerCardId: copy.id });
    const [offer] = await tx.select().from(actual.tradeOffersTable).where(eq(actual.tradeOffersTable.threadId, thread.id));
    expect(Number(offer.askingPrice)).toBe(30);
    expect(offer.offerHistory?.[0]).toMatchObject({ from: "seller", amount: 30 });
    expect(offer.sellerImages).toContain("https://example.com/my-copy.jpg");
  }));

  it("saves wishlist slots, protects ownership, hides private binders and excludes private notes", async () => isolated(async tx => {
    const owner = `test-binder-${randomUUID()}`, other = `test-other-${randomUUID()}`;
    const [wish] = await tx.insert(actual.wishlistItemsTable).values({
      ownerClerkId: owner, catalogCardId: "test-printing", name: "Test wishlist card", pokemonName: "Test",
      notes: "NEVER-PUBLIC-WISHLIST-NOTE", lastSeenPrice: "123.45",
    }).returning();
    const [foreignWish] = await tx.insert(actual.wishlistItemsTable).values({
      ownerClerkId: other, catalogCardId: "test-printing", name: "Foreign card", pokemonName: "Test",
    }).returning();
    const create = await request(app).post("/api/binders").set("x-test-owner", owner).send({
      name: "Test binder", style: "ring", coverColor: "#112233", pageCount: 2,
      rows: 3, columns: 3, widthMm: 250, heightMm: 310,
    });
    expect(create.status).toBe(201);
    expect(create.body.isPublic).toBe(false);
    const draft = create.body;
    draft.pages[0].slots = [{ slot: 0, cardId: -wish.id }];
    const saved = await request(app).put(`/api/binders/${draft.id}`).set("x-test-owner", owner).send({ ...draft, isPublic: true });
    expect(saved.status).toBe(200);
    expect(saved.body.shareToken).toBeTruthy();
    const token = saved.body.shareToken;
    const stored = await tx.select().from(actual.binderSlotsTable).where(eq(actual.binderSlotsTable.pageId, draft.pages[0].id));
    expect(stored[0]).toMatchObject({ cardId: null, wishlistItemId: wish.id });
    const reloaded = await request(app).get(`/api/binders/${draft.id}`).set("x-test-owner", owner);
    expect(reloaded.body.pages[0].slots).toEqual([{ slot: 0, cardId: -wish.id }]);
    const publicView = await request(app).get(`/api/public/binders/${token}`);
    expect(publicView.status).toBe(200);
    expect(publicView.body.cards).toEqual([{
      id: -wish.id, name: wish.name, imageUrl: null, catalogCardId: "test-printing",
      setId: null, setName: null, cardNumber: null, condition: null, media: [],
    }]);
    expect(publicView.body.isOwner).toBe(false);
    expect(publicView.body).not.toHaveProperty("ownerId");
    expect(JSON.stringify(publicView.body)).not.toContain(owner);
    expect((await request(app).get(`/api/public/binders/${token}`).set("x-test-owner", owner)).body.isOwner).toBe(true);
    expect(JSON.stringify(publicView.body)).not.toContain("NEVER-PUBLIC");
    expect(JSON.stringify(publicView.body)).not.toContain("lastSeenPrice");
    const summary = await request(app).get("/api/binders").set("x-test-owner", owner);
    expect(summary.body[0].cardCount).toBe(0);
    expect((await request(app).get(`/api/binders/${draft.id}`).set("x-test-owner", other)).status).toBe(404);
    expect((await request(app).put(`/api/binders/${draft.id}`).set("x-test-owner", owner).send(draft)).status).toBe(409);
    const foreign = { ...saved.body, pages: saved.body.pages.map((p: {id: string}) => p.id === draft.pages[0].id ? { ...p, rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots: [{ slot: 0, cardId: -foreignWish.id }] } : p) };
    expect((await request(app).put(`/api/binders/${draft.id}`).set("x-test-owner", owner).send(foreign)).status).toBe(400);
    const privateSave = await request(app).put(`/api/binders/${draft.id}`).set("x-test-owner", owner).send({ ...saved.body, isPublic: false });
    expect(privateSave.status).toBe(200);
    expect((await request(app).get(`/api/public/binders/${token}`)).status).toBe(404);
    expect((await request(app).post(`/api/public/binders/${token}/slots/${draft.pages[0].id}/0/thread`).set("x-test-owner", other).send({ intent: "give", message: "A gift" })).status).toBe(404);
  }));

  it("contacts only a public wishlist slot, reuses the Inbox thread and retains messages after removal", async () => isolated(async tx => {
    const owner = `test-owner-${randomUUID()}`, visitor = `test-visitor-${randomUUID()}`;
    const [wish] = await tx.insert(actual.wishlistItemsTable).values({
      ownerClerkId: owner, catalogCardId: "test-contact-card", name: "Wishlist Pikachu", pokemonName: "Pikachu",
    }).returning();
    const [binder] = await tx.insert(actual.bindersTable).values({
      ownerClerkId: owner, name: "Public binder", style: "ring", coverColor: "#112233", isPublic: true, shareToken: randomUUID(),
    }).returning();
    const pageId = randomUUID();
    await tx.insert(actual.binderPagesTable).values({
      id: pageId, binderId: binder.id, position: 0, rows: 3, columns: 3, widthMm: 250, heightMm: 310,
    });
    await tx.insert(actual.binderSlotsTable).values({ pageId, slot: 0, wishlistItemId: wish.id });
    const url = `/api/public/binders/${binder.shareToken}/slots/${pageId}/0/thread`;
    expect((await request(app).post(url).send({ intent: "give", message: "Hello" })).status).toBe(401);
    expect((await request(app).post(url).set("x-test-owner", owner).send({ intent: "give", message: "Hello" })).status).toBe(403);
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "sell", message: "   " })).status).toBe(400);
    const first = await request(app).post(url).set("x-test-owner", visitor).send({ intent: "trade", message: "I have this card to trade." });
    expect(first.status).toBe(200);
    const second = await request(app).post(url).set("x-test-owner", visitor).send({ intent: "give", message: "Or I can give it." });
    expect(second.body.threadId).toBe(first.body.threadId);
    const messages = await tx.select().from(actual.dmMessagesTable).where(eq(actual.dmMessagesTable.threadId, first.body.threadId));
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("Wishlist Pikachu");
    expect(messages[0].content).toContain("trade");
    expect((await request(app).post(url.replace("/0/thread", "/1/thread")).set("x-test-owner", visitor).send({ intent: "give", message: "Gift" })).status).toBe(404);
    await tx.delete(actual.wishlistItemsTable).where(eq(actual.wishlistItemsTable.id, wish.id));
    expect((await request(app).post(url).set("x-test-owner", visitor).send({ intent: "give", message: "Gift" })).status).toBe(404);
    expect((await tx.select().from(actual.dmMessagesTable).where(eq(actual.dmMessagesTable.threadId, first.body.threadId)))).toHaveLength(2);
  }));
});
