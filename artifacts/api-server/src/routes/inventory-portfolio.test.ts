import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  filters: [] as unknown[],
  metadata: vi.fn(),
}));
vi.mock("@workspace/db", () => {
  const table = (name: string, fields: string[]) =>
    Object.fromEntries(fields.map((field) => [field, `${name}.${field}`]));
  const select = () => {
    const rows = state.rows.shift() ?? [];
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "innerJoin"]) chain[method] = () => chain;
    chain.where = (filter: unknown) => { state.filters.push(filter); return Promise.resolve(rows); };
    return chain;
  };
  return {
    db: { select, selectDistinct: select },
    cardsTable: table("cards", ["id", "ownerClerkId", "pokemonName", "setId", "setName", "catalogCardId", "categoryId", "estimatedValue", "forSale", "rarity", "condition"]),
    categoriesTable: table("categories", ["id", "name", "ownerClerkId"]),
    wishlistItemsTable: table("wishlist", ["id", "ownerClerkId", "setName", "setCode", "lastSeenPrice"]),
    bindersTable: table("binders", ["id", "name", "ownerClerkId"]),
    binderPagesTable: table("pages", ["id", "binderId"]),
    binderSlotsTable: table("slots", ["cardId", "pageId"]),
    listingsTable: {}, activityEventsTable: {}, shortLinksTable: {}, dmThreadsTable: {},
  };
});
vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  sql: () => ({}), desc: () => ({}), inArray: () => ({}),
}));
vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: express.Request & { userId?: string }, res: express.Response, next: express.NextFunction) => {
    if (!req.headers["x-test-user"]) { res.status(401).end(); return; }
    req.userId = String(req.headers["x-test-user"]);
    next();
  },
}));
vi.mock("../lib/portfolio-catalog-metadata.js", () => ({
  loadPortfolioMetadata: state.metadata,
}));
import router from "./inventory.js";
const app = express();
app.use(router);

describe("authenticated portfolio endpoint", () => {
  beforeEach(() => {
    state.rows = [];
    state.filters = [];
    state.metadata.mockReset().mockResolvedValue({ years: new Map(), types: new Map(), pending: false, unavailable: false });
  });
  it("requires authentication before accessing any collection data", async () => {
    expect((await request(app).get("/inventory/portfolio-breakdowns")).status).toBe(401);
    expect(state.filters).toHaveLength(0);
    expect(state.metadata).not.toHaveBeenCalled();
  });
  it("rejects unknown dimensions without querying data", async () => {
    const response = await request(app).get("/inventory/portfolio-breakdowns?dimension=not_valid").set("x-test-user", "owner");
    expect(response.status).toBe(400);
    expect(state.filters).toHaveLength(0);
  });
  it("scopes all three reads to the signed-in owner and separates wishlist totals", async () => {
    state.rows = [[{
      id: 1, pokemonName: "Pikachu", setId: "base1", setName: "Base Set", catalogCardId: "base1-58",
      categoryId: null, categoryName: null, estimatedValue: "20.50", forSale: true, rarity: "common", condition: "mint",
    }], [{ id: 2, setCode: "base1", setName: "Base Set", lastSeenPrice: "300" }], []];
    const response = await request(app).get("/inventory/portfolio-breakdowns?dimension=binder").set("x-test-user", "owner");
    expect(response.status).toBe(200);
    expect(response.body.ownedValue).toBe(20.5);
    expect(response.body.wishlistValue).toBe(300);
    expect(response.body.dimensions).toHaveLength(10);
    expect(state.filters).toEqual([
      { column: "cards.ownerClerkId", value: "owner" },
      { column: "wishlist.ownerClerkId", value: "owner" },
      { conditions: [{ column: "binders.ownerClerkId", value: "owner" }, { column: "cards.ownerClerkId", value: "owner" }] },
    ]);
    expect(state.metadata).toHaveBeenCalledWith(expect.any(Array), "binder");
  });
  it("uses the requested metadata dimension and includes unknowns without changing total value", async () => {
    state.rows = [[{
      id: 1, pokemonName: "Pikachu", setId: "base1", setName: "Base Set", catalogCardId: "base1-58",
      categoryId: null, categoryName: null, estimatedValue: "10", forSale: false, rarity: "common", condition: "mint",
    }], [], []];
    state.metadata.mockResolvedValue({ years: new Map([["base1", "1999"]]), types: new Map(), pending: true, unavailable: false });
    const response = await request(app).get("/inventory/portfolio-breakdowns?dimension=year").set("x-test-user", "owner");
    expect(response.status).toBe(200);
    expect(response.body.metadataPending).toBe(true);
    expect(response.body.dimensions.find((dimension: { key: string }) => dimension.key === "year").groups[0].label).toBe("1999");
    expect(response.body.ownedValue).toBe(10);
    expect(state.metadata).toHaveBeenCalledWith(expect.any(Array), "year");
  });
});