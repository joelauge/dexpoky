import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockGetAuth } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    transaction: vi.fn(),
    delete: vi.fn(),
  },
  mockGetAuth: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => ({
  ...await importOriginal<typeof import("@workspace/db")>(),
  db: mockDb,
}));
vi.mock("@clerk/express", () => ({ getAuth: mockGetAuth }));
vi.mock("../lib/userSync.js", () => ({ ensureUserSynced: vi.fn() }));

import bindersRouter from "./binders.js";

function selectQuery(result: unknown) {
  const query: Record<string, any> = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.for = vi.fn(() => Promise.resolve(result));
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
}

describe("binder routes", () => {
  const app = express();
  app.use(express.json());
  app.use(bindersRouter);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuth.mockReturnValue({ userId: "owner-a" });
  });

  it("requires authentication on binder endpoints", async () => {
    mockGetAuth.mockReturnValue(null);
    const response = await request(app).get("/binders");
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Unauthorized" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns 404 for a binder not owned by the authenticated user", async () => {
    mockDb.select.mockReturnValue(selectQuery([]));
    const response = await request(app).get("/binders/17");
    expect(response.status).toBe(404);
    expect(response.body.error).toContain("not found");
  });

  it("returns 409 for stale revisions before touching the saved layout", async () => {
    const binder = {
      id: 17,
      ownerClerkId: "owner-a",
      name: "Saved",
      style: "ring",
      coverColor: "#112233",
      revision: 3,
    };
    const tx = { select: vi.fn(() => selectQuery([binder])) };
    mockDb.transaction.mockImplementation((callback: (transaction: unknown) => unknown) => callback(tx));
    const response = await request(app).put("/binders/17").send({
      name: "Changed",
      style: "ring",
      coverColor: "#112233",
      revision: 2,
      pages: [{ id: "page_1", rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots: [] }],
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toContain("revision conflict");
    expect(tx.select).toHaveBeenCalledOnce();
  });
});