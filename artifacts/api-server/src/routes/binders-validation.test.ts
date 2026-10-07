import { describe, expect, it } from "vitest";
import { validateCreateBinder, validateOwnedCardIds, validateUpdateBinder } from "./binders-validation.js";

const page = (overrides: Record<string, unknown> = {}) => ({
  id: "page_1",
  rows: 3,
  columns: 3,
  widthMm: 250,
  heightMm: 310,
  slots: [],
  ...overrides,
});
const update = (pages: unknown[], overrides: Record<string, unknown> = {}) => ({
  name: "My Binder",
  style: "ring",
  coverColor: "#112233",
  revision: 1,
  pages,
  ...overrides,
});

describe("binder request validation", () => {
  it("enforces create page bounds and integer dimensions/counts", () => {
    const valid = {
      name: " Binder ",
      style: "ring",
      coverColor: "#112233",
      rows: 3,
      columns: 3,
      widthMm: 250,
      heightMm: 310,
      pageCount: 4,
    };
    expect(validateCreateBinder(valid)).toMatchObject({ success: true, data: { name: "Binder" } });
    expect(validateCreateBinder({ ...valid, rows: 6 }).success).toBe(false);
    expect(validateCreateBinder({ ...valid, pageCount: 21 }).success).toBe(false);
    expect(validateCreateBinder({ ...valid, widthMm: 250.5 }).success).toBe(false);
  });

  it("rejects duplicate page IDs, duplicate pockets, and out-of-layout pockets", () => {
    expect(validateUpdateBinder(update([page(), page()])).success).toBe(false);
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 0, cardId: 1 }, { slot: 0, cardId: 2 }] })])).success).toBe(false);
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 9, cardId: 1 }] })])).success).toBe(false);
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 1.5, cardId: 1 }] })])).success).toBe(false);
    expect(validateUpdateBinder(update([
      page({ slots: [{ slot: 0, cardId: 7 }] }),
      page({ id: "page_2", slots: [{ slot: 1, cardId: 7 }] }),
    ])).success).toBe(false);
  });

  it("rejects non-integer page dimensions and invalid page IDs", () => {
    expect(validateUpdateBinder(update([page({ rows: 2.5 })])).success).toBe(false);
    expect(validateUpdateBinder(update([page({ id: "bad/id" })])).success).toBe(false);
  });

  it("rejects foreign card IDs while allowing any one owned ID once", () => {
    expect(validateOwnedCardIds([3, 4], [3, 4])).toBeNull();
    expect(validateOwnedCardIds([3, 5], [3, 4])).toContain("not in your collection");
  });
  it("allows wishlist pockets but rejects duplicate wishlist placements and zero IDs", () => {
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 0, cardId: -7 }] })])).success).toBe(true);
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 0, cardId: -7 }, { slot: 1, cardId: -7 }] })])).success).toBe(false);
    expect(validateUpdateBinder(update([page({ slots: [{ slot: 0, cardId: 0 }] })])).success).toBe(false);
  });
});