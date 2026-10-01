import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express from "express";

const {
  mockPwGetCard,
  mockPwSearch,
  mockEnrichImages,
  mockTcgcsvCard,
  mockTcgcsvPricing,
  mockSearchTcgcsv,
  mockSelectResults,
  mockDbSelect,
} = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const select = vi.fn(() => {
    const result = selectResults.shift() ?? [];
    const query: Record<string, any> = {};
    query.from = vi.fn(() => query);
    query.where = vi.fn(() => query);
    query.orderBy = vi.fn(() => query);
    query.then = (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject);
    return query;
  });
  return {
    mockPwGetCard: vi.fn(),
    mockPwSearch: vi.fn(),
    mockEnrichImages: vi.fn(),
    mockTcgcsvCard: vi.fn(),
    mockTcgcsvPricing: vi.fn(),
    mockSearchTcgcsv: vi.fn(),
    mockSelectResults: selectResults,
    mockDbSelect: select,
  };
});

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_target, property) => `${name}.${String(property)}`,
  });
  return {
    db: {
      select: mockDbSelect,
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    wishlistItemsTable: table("wishlist_items"),
    decksTable: table("decks"),
    deckCardsTable: table("deck_cards"),
    cardsTable: table("cards"),
    categoriesTable: table("categories"),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
  and: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = "test-user";
    next();
  },
}));

vi.mock("../lib/pokewallet.js", () => ({
  pwGetCard: mockPwGetCard,
  pwSearch: mockPwSearch,
  normalizeCatalogCard: vi.fn(),
  buildPricingFromCatalog: vi.fn(),
  enrichCatalogCardImages: mockEnrichImages,
  extractPokemonName: (name: string) => name,
}));

vi.mock("../lib/tcgcsv.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/tcgcsv.js")>(),
  getTcgcsvCard: mockTcgcsvCard,
  getTcgcsvPricing: mockTcgcsvPricing,
  searchTcgcsv: mockSearchTcgcsv,
}));

vi.mock("./detect-helpers.js", () => ({
  searchTcgdex: vi.fn(),
}));

vi.mock("./rules.js", () => ({
  getMultiSectionText: vi.fn(() => ""),
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {},
}));

import catalogRouter from "./catalog.js";
import wishlistRouter from "./wishlist.js";
import decksRouter from "./decks.js";

const app = express();
app.use(express.json());
app.use("/api", catalogRouter, wishlistRouter, decksRouter);

beforeEach(() => {
  vi.clearAllMocks();
  mockSelectResults.length = 0;
});

describe("invalid TCGCSV namespace dispatch", () => {
  const malformedId = "tcgcsv_24461_713249x";

  it("rejects malformed catalog detail IDs without calling either provider or image enrichment", async () => {
    const response = await request(app).get(`/api/catalog/cards/${malformedId}`);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Catalog card not found" });
    expect(mockPwGetCard).not.toHaveBeenCalled();
    expect(mockTcgcsvCard).not.toHaveBeenCalled();
    expect(mockTcgcsvPricing).not.toHaveBeenCalled();
    expect(mockEnrichImages).not.toHaveBeenCalled();
  });

  it("does not send malformed wishlist IDs through TCGdex image backfill", async () => {
    mockSelectResults.push([{
      id: 11,
      catalogCardId: malformedId,
      name: "Pikachu",
      pokemonName: "Pikachu",
      setName: "Test Set",
      setCode: "TST",
      cardNumber: "1",
      rarity: null,
      imageUrl: null,
      lastSeenPrice: null,
      notes: null,
      priority: "normal",
      categoryId: null,
      addedAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    }]);

    const response = await request(app).get("/api/wishlist");

    expect(response.status).toBe(200);
    expect(response.body[0].catalogCardId).toBe(malformedId);
    expect(mockEnrichImages).not.toHaveBeenCalled();
    expect(mockTcgcsvCard).not.toHaveBeenCalled();
    expect(mockTcgcsvPricing).not.toHaveBeenCalled();
    expect(mockPwGetCard).not.toHaveBeenCalled();
  });

  it("rejects malformed wishlist saves before any catalog or image lookup", async () => {
    const response = await request(app)
      .post("/api/wishlist")
      .send({ catalogCardId: malformedId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Catalog card not found" });
    expect(mockPwGetCard).not.toHaveBeenCalled();
    expect(mockTcgcsvCard).not.toHaveBeenCalled();
    expect(mockTcgcsvPricing).not.toHaveBeenCalled();
    expect(mockEnrichImages).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("rejects malformed direct deck catalog IDs before provider lookup or writes", async () => {
    mockSelectResults.push([{ ownerClerkId: "test-user" }]);

    const response = await request(app)
      .post("/api/decks/1/cards")
      .send({ catalogCardId: malformedId });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Catalog card not found" });
    expect(mockPwGetCard).not.toHaveBeenCalled();
    expect(mockTcgcsvCard).not.toHaveBeenCalled();
    expect(mockTcgcsvPricing).not.toHaveBeenCalled();
    expect(mockEnrichImages).not.toHaveBeenCalled();
  });
});