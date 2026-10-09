import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const TEST_USER_ID = "user_cards_handlers";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));

const mockTables = vi.hoisted(() => ({
  cardsTable: {
    id: "cards.id",
    ownerClerkId: "cards.ownerClerkId",
    name: "cards.name",
    pokemonName: "cards.pokemonName",
    setName: "cards.setName",
    setId: "cards.setId",
    cardNumber: "cards.cardNumber",
    rarity: "cards.rarity",
    condition: "cards.condition",
    edition: "cards.edition",
    imageUrl: "cards.imageUrl",
    originalScanUrl: "cards.originalScanUrl",
    media: "cards.media",
    catalogCardId: "cards.catalogCardId",
    estimatedValue: "cards.estimatedValue",
    acquiredDate: "cards.acquiredDate",
    categoryId: "cards.categoryId",
    collectionId: "cards.collectionId",
    forSale: "cards.forSale",
    listingPrice: "cards.listingPrice",
    notes: "cards.notes",
    cardStory: "cards.cardStory",
    agentAcquiredAt: "cards.agentAcquiredAt",
    createdAt: "cards.createdAt",
    updatedAt: "cards.updatedAt",
  },
  categoriesTable: {
    id: "categories.id",
    name: "categories.name",
    ownerClerkId: "categories.ownerClerkId",
  },
  collectionsTable: {
    id: "collections.id",
    name: "collections.name",
    ownerClerkId: "collections.ownerClerkId",
  },
  activityEventsTable: {},
}));

const mockEvaluateCardConfidence = vi.hoisted(() => vi.fn());
const mockFetchPricingById = vi.hoisted(() => vi.fn());
const mockGetAuth = vi.hoisted(() => vi.fn());
const mockInspectMedia = vi.hoisted(() => vi.fn());
const mockVerifyUploadClaim = vi.hoisted(() => vi.fn());
const mockGetObjectFile = vi.hoisted(() => vi.fn());

vi.mock("@clerk/express", () => ({ getAuth: mockGetAuth }));
vi.mock("./detect-helpers.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./detect-helpers.js")>(),
  fetchPricingById: mockFetchPricingById,
}));
vi.mock("../lib/objectStorage.js", () => ({
  ObjectStorageService: class {
    getObjectEntityFile = mockGetObjectFile;
  },
}));
vi.mock("../lib/card-media.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/card-media.js")>(),
  inspectStoredCardMedia: mockInspectMedia,
  verifyCardMediaUploadClaim: mockVerifyUploadClaim,
}));

vi.mock("@workspace/db", () => ({
  db: mockDb,
  ...mockTables,
}));

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  inArray: (column: unknown, values: unknown[]) => ({ op: "inArray", column, values }),
  ilike: (column: unknown, value: unknown) => ({ op: "ilike", column, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", strings, values }),
}));

vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (req: { userId?: string }, _res: unknown, next: () => void) => {
    req.userId = TEST_USER_ID;
    next();
  },
}));

vi.mock("../lib/card-confidence.js", () => ({
  evaluateCardConfidence: mockEvaluateCardConfidence,
}));

import cardsRouter from "./cards.js";

const app = express();
app.use(express.json());
app.use(cardsRouter);

const selectResults: unknown[][] = [];
const returningResults: unknown[][] = [];
const dbOperations: Array<Record<string, unknown>> = [];

function makeSelectChain(): any {
  const chain: Record<string, any> = {};
  for (const method of ["from", "leftJoin", "where", "orderBy", "limit"]) {
    chain[method] = (...args: unknown[]) => {
      dbOperations.push({ op: `select.${method}`, args });
      return chain;
    };
  }
  chain.then = (
    resolve: (value: unknown[]) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(selectResults.shift() ?? []).then(resolve, reject);
  return chain;
}

function makeInsertChain(table: unknown): any {
  const chain: Record<string, any> = {};
  chain.values = (values: unknown) => {
    dbOperations.push({ op: "insert.values", table, values });
    return chain;
  };
  chain.returning = (projection?: unknown) => {
    dbOperations.push({ op: "insert.returning", table, projection });
    return Promise.resolve(returningResults.shift() ?? []);
  };
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(undefined).then(resolve, reject);
  return chain;
}

function makeUpdateChain(table: unknown): any {
  const chain: Record<string, any> = {};
  chain.set = (values: unknown) => {
    dbOperations.push({ op: "update.set", table, values });
    return chain;
  };
  chain.where = (...args: unknown[]) => {
    dbOperations.push({ op: "update.where", args });
    return chain;
  };
  chain.returning = (projection?: unknown) => {
    dbOperations.push({ op: "update.returning", table, projection });
    return Promise.resolve(returningResults.shift() ?? []);
  };
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(undefined).then(resolve, reject);
  return chain;
}

beforeEach(() => {
  selectResults.length = 0;
  returningResults.length = 0;
  dbOperations.length = 0;
  mockDb.select.mockReset().mockImplementation((projection: unknown) => {
    dbOperations.push({ op: "select", projection });
    return makeSelectChain();
  });
  mockDb.insert.mockReset().mockImplementation((table: unknown) => {
    dbOperations.push({ op: "insert", table });
    return makeInsertChain(table);
  });
  mockDb.update.mockReset().mockImplementation((table: unknown) => {
    dbOperations.push({ op: "update", table });
    return makeUpdateChain(table);
  });
  mockDb.delete.mockReset().mockImplementation((table: unknown) => ({
    where: (...args: unknown[]) => {
      dbOperations.push({ op: "delete.where", table, args });
      return Promise.resolve();
    },
  }));
  mockDb.transaction.mockReset().mockImplementation(
    async (callback: (tx: typeof mockDb) => Promise<unknown>) => {
      dbOperations.push({ op: "transaction" });
      return callback(mockDb);
    },
  );
  mockEvaluateCardConfidence.mockReset().mockResolvedValue({
    confidence: 0.93,
    summary: "Synthetic saved-card assessment",
  });
  mockGetAuth.mockReset().mockReturnValue({ userId: TEST_USER_ID });
  mockFetchPricingById.mockReset().mockResolvedValue({ marketPrice: 12.5 });
  mockVerifyUploadClaim.mockReset().mockReturnValue(true);
  mockInspectMedia.mockReset().mockResolvedValue({ width: 800, height: 1100 });
  mockGetObjectFile.mockReset().mockResolvedValue({});
});

function expectOwnedWhere(operationName: string, table: { ownerClerkId: string } = mockTables.cardsTable) {
  expect(dbOperations.filter((op) => op.op === operationName)).toEqual(
    expect.arrayContaining([expect.objectContaining({
      args: [expect.objectContaining({
        op: "and",
        conditions: expect.arrayContaining([
          { op: "eq", column: table.ownerClerkId, value: TEST_USER_ID },
        ]),
      })],
    })]),
  );
}

describe("card CRUD handler request schemas", () => {
  it("accepts a valid GET /cards query and reaches the owned-card select", async () => {
    const rows = [{ id: 11, name: "Synthetic Dragon", ownerClerkId: TEST_USER_ID }];
    selectResults.push(rows);

    const response = await request(app)
      .get("/cards")
      .query({ categoryId: "4", forSale: "true", search: "Dragon", rarity: "rare" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(rows);
    expect(dbOperations.some((operation) => operation.op === "select.orderBy")).toBe(true);
    expectOwnedWhere("select.where");
  });

  it("accepts a valid POST /cards body and inserts an owned card", async () => {
    const inserted = {
      id: 12,
      ownerClerkId: TEST_USER_ID,
      name: "Synthetic Dragon",
      pokemonName: "Synthetic Dragon",
      estimatedValue: "12.5",
      imageUrl: null,
    };
    returningResults.push([inserted]);
    selectResults.push([inserted]);

    const response = await request(app).post("/cards").send({
      name: "Synthetic Dragon",
      pokemonName: "Synthetic Dragon",
      setName: "Synthetic Set",
      setId: "syn1",
      cardNumber: "1",
      rarity: "rare",
      condition: "near_mint",
      edition: "first_edition",
      forSale: false,
      estimatedValue: 12.5,
    });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe(12);
    const insert = dbOperations.find((operation) => operation.op === "insert.values");
    expect(insert?.values).toMatchObject({
      ownerClerkId: TEST_USER_ID,
      name: "Synthetic Dragon",
      setId: "syn1",
      edition: "first_edition",
      estimatedValue: "12.5",
    });
  });

  it("accepts a numeric card ID and valid PUT /cards/:id body", async () => {
    selectResults.push(
      [{ ownerClerkId: TEST_USER_ID }],
      [{ id: 13, name: "Updated Synthetic Dragon", ownerClerkId: TEST_USER_ID }],
    );

    const response = await request(app).put("/cards/13").send({
      name: "Updated Synthetic Dragon",
      cardNumber: "7",
      edition: "shadowless",
      estimatedValue: 18.4,
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(13);
    expect(dbOperations.some((operation) => operation.op === "update.set")).toBe(true);
    expect(dbOperations.find((operation) => operation.op === "update.set")?.values).toMatchObject({
      name: "Updated Synthetic Dragon",
      cardNumber: "7",
      edition: "shadowless",
      estimatedValue: "18.4",
    });
  });
  it("does not clear an owned edition when updating unrelated fields", async () => {
    selectResults.push(
      [{ ownerClerkId: TEST_USER_ID }],
      [{ id: 13, edition: "shadowless", ownerClerkId: TEST_USER_ID }],
    );
    const response = await request(app).put("/cards/13").send({ notes: "Kept separately" });
    expect(response.status).toBe(200);
    expect(dbOperations.find(operation => operation.op === "update.set")?.values).not.toHaveProperty("edition");
  });
  it("does not clear editions during an unrelated bulk update", async () => {
    selectResults.push([{ id: 31 }], [{ id: 31, edition: "first_edition", ownerClerkId: TEST_USER_ID }]);
    const response = await request(app).put("/cards/bulk-update").send({ cardIds: [31], condition: "near_mint" });
    expect(response.status).toBe(200);
    expect(dbOperations.find(operation => operation.op === "update.set")?.values).not.toHaveProperty("edition");
  });
  it("rejects unknown edition enum values without writing", async () => {
    const response = await request(app).put("/cards/13").send({ edition: "probably first" });
    expect(response.status).toBe(400);
    expect(dbOperations.some(operation => operation.op === "update.set")).toBe(false);
  });

  it("accepts valid POST /cards/bulk entries and runs the transaction", async () => {
    returningResults.push([{ id: 21 }]);
    selectResults.push([{ id: 21, name: "Synthetic Set Card", ownerClerkId: TEST_USER_ID }]);

    const response = await request(app).post("/cards/bulk").send({
      cards: [{
        catalogCardId: "synthetic-set-1",
        name: "Synthetic Set Card",
        setName: "Synthetic Set",
        setId: "syn1",
        cardNumber: "1",
        rarity: "uncommon",
        imageUrl: null,
        estimatedValue: 3.5,
        condition: "near_mint",
        edition: "first_edition_shadowless",
      }],
    });

    expect(response.status).toBe(201);
    expect(response.body.created).toHaveLength(1);
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(dbOperations.find((operation) => operation.op === "insert.values")?.values).toMatchObject({
      ownerClerkId: TEST_USER_ID,
      catalogCardId: "synthetic-set-1",
      name: "Synthetic Set Card",
      edition: "first_edition_shadowless",
    });
  });

  it("accepts valid PUT /cards/bulk-update data and performs the owned update", async () => {
    selectResults.push(
      [{ id: 31 }, { id: 32 }],
      [
        { id: 31, name: "Synthetic One", ownerClerkId: TEST_USER_ID },
        { id: 32, name: "Synthetic Two", ownerClerkId: TEST_USER_ID },
      ],
    );

    const response = await request(app).put("/cards/bulk-update").send({
      cardIds: [31, 32],
      condition: "excellent",
      edition: "unlimited",
      estimatedValue: 6.75,
    });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(dbOperations.some((operation) => operation.op === "update.set")).toBe(true);
    expect(dbOperations.find((operation) => operation.op === "update.set")?.values).toMatchObject({
      condition: "excellent",
      edition: "unlimited",
      estimatedValue: "6.75",
    });
    expectOwnedWhere("select.where");
    expectOwnedWhere("update.where");
  });

  it("scores saved-card confidence through evaluateCardConfidence, without creating a transaction", async () => {
    selectResults.push([{
      id: 41,
      name: "Synthetic Dragon",
      pokemonName: "Synthetic Dragon",
      setId: "syn1",
      setName: "Synthetic Set",
      cardNumber: "1",
      catalogCardId: null,
      condition: "near_mint",
    }]);

    const response = await request(app).post("/cards/41/confidence").send({});

    expect(response.status).toBe(200);
    expect(response.body.confidence).toBe(0.93);
    expect(mockEvaluateCardConfidence).toHaveBeenCalledOnce();
    expect(mockEvaluateCardConfidence).toHaveBeenCalledWith(expect.objectContaining({
      candidate: expect.objectContaining({ id: "41", name: "Synthetic Dragon" }),
      context: expect.objectContaining({ savedCardId: 41 }),
    }));
    expect(mockDb.transaction).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    expectOwnedWhere("select.where");
  });
});

const validCard = {
  name: "Synthetic Dragon", pokemonName: "Synthetic Dragon",
  rarity: "rare", condition: "near_mint", forSale: false,
};
const validBulkCard = {
  catalogCardId: "synthetic-1", name: "Synthetic Dragon", setName: "Synthetic Set",
  setId: "syn1", cardNumber: "1", rarity: "rare", imageUrl: null,
};
const validMedia = {
  url: "/api/storage/objects/uploads/synthetic-image",
  kind: "image", width: 800, height: 1100, uploadClaim: "synthetic-proof",
};

describe("card handler validation and scoped ownership", () => {
  it.each([
    ["post", "/cards", {}],
    ["post", "/cards/bulk", { cards: [] }],
    ["put", "/cards/bulk-update", { cardIds: [] }],
    ["put", "/cards/abc", { name: "Changed" }],
    ["put", "/cards/1", { condition: "invalid" }],
    ["get", "/cards/abc", undefined],
    ["get", "/cards?categoryId=abc", undefined],
    ["delete", "/cards/abc", undefined],
    ["post", "/cards/abc/confidence", {}],
    ["post", "/cards/1/media", { ...validMedia, width: 1.5 }],
  ] as const)("rejects invalid %s %s without DB operations", async (method, path, body) => {
    const response = await request(app)[method](path).send(body);
    expect(response.status).toBe(400);
    expect(dbOperations).toEqual([]);
  });

  it.each(["put", "delete"] as const)("blocks %s for another owner's card", async (method) => {
    selectResults.push([{ ownerClerkId: "another-owner" }]);
    const response = await request(app)[method]("/cards/13").send({ name: "Changed" });
    expect(response.status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it.each(["get", "put", "delete"] as const)("returns 404 for missing cards on %s", async (method) => {
    selectResults.push([]);
    const response = await request(app)[method]("/cards/13").send({ name: "Changed" });
    expect(response.status).toBe(404);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("reads the owner's card and deletes only the requested card", async () => {
    selectResults.push([{ id: 13, ownerClerkId: TEST_USER_ID, forSale: false }]);
    expect((await request(app).get("/cards/13")).status).toBe(200);
    selectResults.push([{ ownerClerkId: TEST_USER_ID }]);
    expect((await request(app).delete("/cards/13")).status).toBe(204);
    expect(dbOperations.find((op) => op.op === "delete.where")?.args).toEqual([
      { op: "eq", column: mockTables.cardsTable.id, value: 13 },
    ]);
  });

  it.each([false, true])("limits non-owner reads to for-sale cards (%s)", async (forSale) => {
    selectResults.push([{ id: 13, ownerClerkId: "another-owner", forSale }]);
    expect((await request(app).get("/cards/13")).status).toBe(forSale ? 200 : 403);
  });

  it("refuses confidence scoring when the owned-card query has no match", async () => {
    selectResults.push([]);
    expect((await request(app).post("/cards/13/confidence").send({})).status).toBe(404);
    expectOwnedWhere("select.where");
    expect(mockEvaluateCardConfidence).not.toHaveBeenCalled();
    expect(mockFetchPricingById).not.toHaveBeenCalled();
  });

  it("derives confidence pricing and identity from the saved card, not the request body", async () => {
    selectResults.push([{
      id: 13, catalogCardId: "synthetic-1", name: "Synthetic Dragon",
      setId: "syn1", setName: "Synthetic Set", cardNumber: "1", condition: "mint",
    }]);
    const response = await request(app).post("/cards/13/confidence").send({
      candidate: { id: "untrusted" }, pricing: { marketPrice: 999 },
    });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(mockFetchPricingById).toHaveBeenCalledWith("synthetic-1", "Synthetic Dragon", undefined, {
      name: "Synthetic Dragon", setName: "Synthetic Set", cardNumber: "1",
    });
    expect(mockEvaluateCardConfidence).toHaveBeenCalledWith(expect.objectContaining({
      candidate: expect.objectContaining({ id: "synthetic-1" }),
      pricing: { marketPrice: 12.5 },
    }));
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it.each(["categoryId", "collectionId"])("rejects foreign %s when creating a card", async (field) => {
    selectResults.push([]);
    const response = await request(app).post("/cards").send({ ...validCard, [field]: 99 });
    expect(response.status).toBe(400);
    expectOwnedWhere("select.where", field === "categoryId" ? mockTables.categoriesTable : mockTables.collectionsTable);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("rejects foreign collections before bulk inserts", async () => {
    selectResults.push([]);
    const response = await request(app).post("/cards/bulk").send({
      cards: [{ ...validBulkCard, collectionId: 99 }],
    });
    expect(response.status).toBe(400);
    expectOwnedWhere("select.where", mockTables.collectionsTable);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("refuses a mixed-owner bulk update without writing anything", async () => {
    selectResults.push([{ id: 31 }]);
    const response = await request(app).put("/cards/bulk-update").send({
      cardIds: [31, 32], condition: "mint",
    });
    expect(response.status).toBe(403);
    expectOwnedWhere("select.where");
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it.each(["single", "bulk"])("rejects a foreign collection on %s update", async (mode) => {
    if (mode === "single") selectResults.push([{ ownerClerkId: TEST_USER_ID }]);
    selectResults.push([]);
    const response = mode === "single"
      ? await request(app).put("/cards/13").send({ collectionId: 99 })
      : await request(app).put("/cards/bulk-update").send({ cardIds: [13], collectionId: 99 });
    expect(response.status).toBe(400);
    expectOwnedWhere("select.where", mockTables.collectionsTable);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("assigns an owned collection in a bulk update and permits clearing the saved value", async () => {
    selectResults.push([{ id: 99 }], [{ id: 13 }], [{ id: 13, collectionId: 99, estimatedValue: null }]);
    const response = await request(app).put("/cards/bulk-update").send({
      cardIds: [13], collectionId: 99, estimatedValue: null,
    });
    expect(response.status).toBe(200);
    expect(dbOperations.find((op) => op.op === "update.set")?.values).toMatchObject({
      collectionId: 99, estimatedValue: null,
    });
    expectOwnedWhere("select.where", mockTables.collectionsTable);
    expectOwnedWhere("update.where");
  });
});

describe("restored pricing and gallery operations", () => {
  it("accepts the string catalog cardId query and retains exact pricing context", async () => {
    const response = await request(app).get("/cards/pricing").query({
      cardId: "synthetic-1", name: "Synthetic Dragon", setName: "Synthetic Set", cardNumber: "1",
    });
    expect(response.status).toBe(200);
    expect(mockFetchPricingById).toHaveBeenCalledWith("synthetic-1", "Synthetic Dragon", undefined, {
      name: "Synthetic Dragon", setName: "Synthetic Set", cardNumber: "1",
    });
  });

  it("saves verified media with an owner-scoped atomic append and gallery limit", async () => {
    selectResults.push([{ ownerClerkId: TEST_USER_ID }]);
    returningResults.push([{ id: 13 }]);
    const response = await request(app).post("/cards/13/media").send(validMedia);
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ url: validMedia.url, width: 800, height: 1100, kind: "image" });
    expect(mockVerifyUploadClaim).toHaveBeenCalledWith("synthetic-proof", TEST_USER_ID, "/objects/uploads/synthetic-image");
    expect(mockInspectMedia).toHaveBeenCalledOnce();
    expectOwnedWhere("update.where");
    expect(JSON.stringify(dbOperations.find((op) => op.op === "update.where"))).toContain("< 20");
    expect(dbOperations.find((op) => op.op === "update.set")?.values).toMatchObject({
      media: expect.objectContaining({ op: "sql" }),
    });
  });

  it("returns the gallery-limit conflict when an atomic append cannot save", async () => {
    selectResults.push([{ ownerClerkId: TEST_USER_ID }], [{ id: 13, ownerClerkId: TEST_USER_ID }]);
    returningResults.push([]);
    expect((await request(app).post("/cards/13/media").send(validMedia)).status).toBe(409);
  });

  it("removes media from only an owned card", async () => {
    selectResults.push([{ ownerClerkId: TEST_USER_ID }]);
    returningResults.push([{ id: 13 }]);
    const response = await request(app).delete("/cards/13/media/11111111-1111-4111-8111-111111111111");
    expect(response.status).toBe(204);
    expectOwnedWhere("update.where");
  });

  it.each(["post", "delete"] as const)("blocks %s media changes for another owner", async (method) => {
    selectResults.push([{ ownerClerkId: "another-owner" }]);
    const path = method === "post" ? "/cards/13/media" : "/cards/13/media/11111111-1111-4111-8111-111111111111";
    expect((await request(app)[method](path).send(validMedia)).status).toBe(403);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockInspectMedia).not.toHaveBeenCalled();
  });
});