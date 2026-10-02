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
    imageUrl: "cards.imageUrl",
    originalScanUrl: "cards.originalScanUrl",
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
  mockDb.delete.mockReset();
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
});

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
      estimatedValue: 18.4,
    });

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(13);
    expect(dbOperations.some((operation) => operation.op === "update.set")).toBe(true);
    expect(dbOperations.find((operation) => operation.op === "update.set")?.values).toMatchObject({
      name: "Updated Synthetic Dragon",
      cardNumber: "7",
      estimatedValue: "18.4",
    });
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
      }],
    });

    expect(response.status).toBe(201);
    expect(response.body.created).toHaveLength(1);
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(dbOperations.find((operation) => operation.op === "insert.values")?.values).toMatchObject({
      ownerClerkId: TEST_USER_ID,
      catalogCardId: "synthetic-set-1",
      name: "Synthetic Set Card",
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
      estimatedValue: 6.75,
    });

    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);
    expect(dbOperations.some((operation) => operation.op === "update.set")).toBe(true);
    expect(dbOperations.find((operation) => operation.op === "update.set")?.values).toMatchObject({
      condition: "excellent",
      estimatedValue: "6.75",
    });
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
  });
});