import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  selectCard: vi.fn(),
  selectCerts: vi.fn(),
  updateValue: vi.fn(),
  insertHistory: vi.fn(),
}));

vi.mock("../lib/price-lookup-service.js", () => ({ lookupCardPrices: mocks.lookup }));
vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ownerId = req.header("x-test-user");
    if (!ownerId) { res.status(401).json({ error: "Unauthorized" }); return; }
    Object.assign(req, { userId: ownerId }); next();
  },
}));
vi.mock("@workspace/db", async importOriginal => {
  const originals = await importOriginal<typeof import("@workspace/db")>();
  return {
  ...originals,
  db: {
    transaction: async (callback: (tx: unknown) => unknown) => callback({
      select: () => ({ from: (table: unknown) => ({ where: () => ({ for: table === originals.cardsTable ? mocks.selectCard : mocks.selectCerts }) }) }),
      update: () => ({ set: (value: unknown) => { mocks.updateValue(value); return { where: async () => [] }; } }),
      insert: () => ({ values: mocks.insertHistory }),
    }),
  },
  };
});

import router, { matchesLookupCard, snapshotValue } from "./price-lookup.js";
import type { PriceComparison } from "../lib/price-lookup-service.js";

const app = express();
app.use(express.json());
app.use(router);

function comparison(): PriceComparison {
  return {
    card: { id: "base1-4", name: "Charizard", setName: "Base Set", cardNumber: "004/102", imageUrl: null },
    finish: "holofoil",
    quotes: [
      { source: "tcgplayer", label: "TCGPlayer", status: "available", amount: 10, currency: "USD", valueUsd: 10, basis: "Market", finish: "holofoil", updatedAt: null, url: null, reason: null, eligible: true },
      { source: "cardmarket", label: "Cardmarket", status: "available", amount: 10, currency: "EUR", valueUsd: 12, basis: "Trend", finish: "holofoil", updatedAt: null, url: null, reason: null, eligible: true },
      { source: "ebay", label: "eBay", status: "reference_only", amount: 999, currency: "USD", valueUsd: 999, basis: "Sold", finish: null, updatedAt: null, url: null, reason: "Unverified finish", eligible: false },
    ],
    averageUsd: 11, averageSourceCount: 2, fx: { eurToUsd: 1.2, date: "2026-10-01", source: "ECB" },
    advice: { status: "skipped", recommendedOption: "average", message: "Compare both sources." },
  };
}

async function getLookup(user = "owner") {
  return request(app).get("/pricing/lookup?catalogCardId=base1-4&finish=holofoil").set("x-test-user", user);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue(comparison());
  mocks.selectCard.mockResolvedValue([{ id: 1, catalogCardId: "base1-4", name: "Charizard", setName: "Base Set", cardNumber: "004" }]);
  mocks.insertHistory.mockResolvedValue([]);
  mocks.selectCerts.mockResolvedValue([]);
});

describe("price snapshot identity and arithmetic", () => {
  it("matches complete normalized printings but never names alone", () => {
    const printing = comparison().card;
    expect(matchesLookupCard({ catalogCardId: null, name: "Charizard", setName: "Base Set", cardNumber: "4" }, printing)).toBe(true);
    expect(matchesLookupCard({ catalogCardId: null, name: "Charizard", setName: "Other Set", cardNumber: "4" }, printing)).toBe(false);
    expect(matchesLookupCard({ catalogCardId: null, name: "Charizard", setName: null, cardNumber: null }, printing)).toBe(false);
  });
  it("recomputes average from independent eligible same-finish prices, not client or model values", () => {
    const result = comparison();
    result.averageUsd = 9999;
    result.quotes.push({ ...result.quotes[0] });
    expect(snapshotValue(result, "average")).toBe(11);
    expect(snapshotValue(result, "cardmarket")).toBe(12);
    result.quotes[1].finish = "reverse_holofoil";
    expect(snapshotValue(result, "average")).toBe(10);
    result.quotes[0].eligible = false;
    result.quotes[3].eligible = false;
    expect(snapshotValue(result, "average")).toBeNull();
  });
});

describe("price lookup and snapshot endpoints", () => {
  function verifiedComparison(): PriceComparison {
    const result = comparison();
    result.condition = "near_mint";
    result.quotes[2] = {
      ...result.quotes[2], status: "available", eligible: true, finish: "holofoil", condition: "near_mint",
      amount: 999, valueUsd: 999,
      verifiedSales: [{
        itemId: "123456789012", title: "Charizard Base Set Unlimited 004/102 English Holo NM",
        url: "https://www.ebay.com/itm/123456789012", soldAt: "2026-10-01", amount: 20,
        currency: "USD", finish: "holofoil", condition: "near_mint", evidence: "Seller-stated exact raw printing and dated USD sale.",
      }],
    };
    return result;
  }
  it("saves only the documented sale median, never the search median, with sale provenance", async () => {
    mocks.lookup.mockResolvedValue(verifiedComparison());
    mocks.selectCard.mockResolvedValue([{ catalogCardId: "base1-4", name: "Charizard", condition: "near_mint" }]);
    const lookup = await getLookup();
    const res = await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "ebay" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(20);
    expect(res.body.source).toContain("ebay-sales=123456789012@2026-10-01=$20");
    expect(mocks.insertHistory).toHaveBeenCalledWith(expect.objectContaining({ price: "20.00" }));
  });
  it("averages verified eBay once alongside independent platform prices", async () => {
    mocks.lookup.mockResolvedValue(verifiedComparison());
    mocks.selectCard.mockResolvedValue([{ catalogCardId: "base1-4", name: "Charizard", condition: "near_mint" }]);
    const lookup = await getLookup();
    const res = await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "average" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(14);
    expect(res.body.source).toContain("tcgplayer+cardmarket+ebay");
  });
  it.each(["ebay", "average"])("rejects condition-incompatible and graded owned copies for %s", async method => {
    mocks.lookup.mockResolvedValue(verifiedComparison());
    mocks.selectCard.mockResolvedValue([{ catalogCardId: "base1-4", name: "Charizard", condition: "light_played" }]);
    const lookup = await getLookup();
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method })).status).toBe(409);
    mocks.selectCard.mockResolvedValue([{ catalogCardId: "base1-4", name: "Charizard", condition: "near_mint" }]);
    mocks.selectCerts.mockResolvedValue([{ status: "verified", grade: "10" }]);
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method })).status).toBe(409);
    expect(mocks.updateValue).not.toHaveBeenCalled();
  });
  it("rejects reference-only eBay and incomplete verified evidence without writes", async () => {
    const lookup = await getLookup();
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "ebay" })).status).toBe(400);
    const result = verifiedComparison();
    result.quotes[2].verifiedSales![0]!.evidence = "";
    expect(snapshotValue(result, "ebay")).toBeNull();
    expect(mocks.updateValue).not.toHaveBeenCalled();
  });
  it("requires sign-in and validates finish", async () => {
    expect((await request(app).get("/pricing/lookup?catalogCardId=base1-4")).status).toBe(401);
    expect((await request(app).get("/pricing/lookup?catalogCardId=base1-4&finish=graded").set("x-test-user", "owner")).status).toBe(400);
  });
  it("returns quotes and owner-scoped expiring server snapshot", async () => {
    const res = await getLookup();
    expect(res.status).toBe(200);
    expect(res.body.quotes).toHaveLength(3);
    expect(res.body.lookupId).toMatch(/^[a-f0-9-]{36}$/);
    expect(Date.parse(res.body.expiresAt) - Date.parse(res.body.observedAt)).toBe(30 * 60_000);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
  it("persists the selected source value and matching history transactionally", async () => {
    const lookup = await getLookup();
    const res = await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "cardmarket" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(12);
    expect(mocks.updateValue).toHaveBeenCalledWith(expect.objectContaining({ estimatedValue: "12.00" }));
    expect(mocks.insertHistory).toHaveBeenCalledWith(expect.objectContaining({ cardId: 1, price: "12.00", source: expect.stringContaining("snapshot:cardmarket") }));
  });
  it("saves eligible average but excludes the eBay reference price", async () => {
    const lookup = await getLookup();
    const res = await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "average" });
    expect(res.status).toBe(200);
    expect(res.body.value).toBe(11);
  });
  it("rejects another user's lookup and forged client prices", async () => {
    const lookup = await getLookup();
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "other")
      .send({ lookupId: lookup.body.lookupId, method: "tcgplayer" })).status).toBe(409);
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "tcgplayer", value: 999 })).status).toBe(400);
    expect(mocks.updateValue).not.toHaveBeenCalled();
  });
  it("refuses mismatched printing or non-owned card", async () => {
    const lookup = await getLookup();
    mocks.selectCard.mockResolvedValue([{ catalogCardId: "base1-5", name: "Charizard", setName: "Other", cardNumber: "5" }]);
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "tcgplayer" })).status).toBe(409);
    mocks.selectCard.mockResolvedValue([]);
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "tcgplayer" })).status).toBe(404);
    expect(mocks.insertHistory).not.toHaveBeenCalled();
  });
  it("refuses unavailable quotes and expired lookup without changing the value", async () => {
    const result = comparison();
    result.quotes.forEach(quote => { quote.eligible = false; });
    mocks.lookup.mockResolvedValue(result);
    const lookup = await getLookup();
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "average" })).status).toBe(400);
    const date = vi.spyOn(Date, "now").mockReturnValue(Date.parse(lookup.body.expiresAt) + 1);
    expect((await request(app).post("/cards/1/value-snapshot").set("x-test-user", "owner")
      .send({ lookupId: lookup.body.lookupId, method: "tcgplayer" })).status).toBe(409);
    date.mockRestore();
    expect(mocks.updateValue).not.toHaveBeenCalled();
  });
});