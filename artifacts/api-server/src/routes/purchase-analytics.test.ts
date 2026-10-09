import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const mock = vi.hoisted(() => ({ select: vi.fn(), filters: [] as unknown[], userId: "buyer-private" as string | null }));
vi.mock("@workspace/db", () => ({
  db: { select: mock.select },
  tradePaymentsTable: { tradeOfferId: "offerId", payerClerkId: "payer", status: "paymentStatus", amountCents: "cents" },
  tradeOffersTable: { id: "offerId", status: "offerStatus" },
  activityEventsTable: { listingId: "listingId", metadata: "metadata", clerkId: "activityBuyer", type: "activityType" },
  agentRunsTable: { agentId: "agentId", listingId: "listingId", amountPathUsd: "amount", clerkId: "agentBuyer", status: "runStatus" },
  dexAgentsTable: { id: "agentId", agentRole: "agentRole" },
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => [column, value],
  and: (...filters: unknown[]) => filters,
}));
vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: any, res: any, next: () => void) => {
    if (!mock.userId) return res.sendStatus(401);
    req.userId = mock.userId;
    next();
  },
}));

import router from "./purchase-analytics.js";
const app = express().use("/api", router);

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-only-purchase-signing-key");
  mock.select.mockReset();
  mock.filters = [];
  mock.userId = "buyer-private";
});
afterEach(() => vi.unstubAllEnvs());

function results(rows: unknown[]) {
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: (filter: unknown) => {
      mock.filters.push(filter);
      return Promise.resolve(rows);
    },
  };
  mock.select.mockReturnValueOnce(query);
}

describe("authoritative buyer purchase feed", () => {
  it("requires authentication", async () => {
    mock.userId = null;
    expect((await request(app).get("/api/analytics/purchases")).status).toBe(401);
    expect(mock.select).not.toHaveBeenCalled();
  });

  it("fails closed without a signing key rather than emitting enumerable IDs", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    expect((await request(app).get("/api/analytics/purchases")).status).toBe(503);
    expect(mock.select).not.toHaveBeenCalled();
  });

  it("requires completed/paid buyer outcomes, excludes seller agents, strips PII and deduplicates", async () => {
    results([{ id: 1, cents: 2500 }, { id: 1, cents: 2500 }]);
    results([
      { id: 2, metadata: { amountCents: 3999, currency: "usd", name: "private", stripeSessionId: "private" } },
      { id: 3, metadata: { price: 999 } }, // legacy asking price is not payment evidence
      { id: 4, metadata: { amountCents: 100, currency: "pathUSD" } },
    ]);
    results([{ id: 5, amount: "19.990000" }, { id: null, amount: "9" }]);
    const res = await request(app).get("/api/analytics/purchases");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(res.body.map((r: any) => [r.source, r.value])).toEqual([
      ["inbox", 25], ["marketplace", 39.99], ["dex_agent", 19.99],
    ]);
    expect(JSON.stringify(res.body)).not.toContain("private");
    expect(mock.filters).toEqual([
      [["payer", "buyer-private"], ["paymentStatus", "completed"], ["offerStatus", "paid"]],
      [["activityBuyer", "buyer-private"], ["activityType", "listing_sold"]],
      [["agentBuyer", "buyer-private"], ["runStatus", "success"], ["agentRole", "buyer"]],
    ]);
  });
});
