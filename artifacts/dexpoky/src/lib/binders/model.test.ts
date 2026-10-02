import assert from "node:assert/strict";
import { test } from "node:test";
import type { BinderPage, Card } from "@workspace/api-client-react";
import {
  cardAt, clearSlot, maxSpread, moveSlot, newPage, placeFromLibrary,
  resizePage, resizePreview, serialize, usageOf,
} from "./model";

const owned = new Map([
  [1, { id: 1, name: "Pikachu" } as Card],
  [2, { id: 2, name: "Eevee" } as Card],
]);
const page = (id: string, slots: BinderPage["slots"] = []): BinderPage => ({
  id, rows: 3, columns: 3, widthMm: 250, heightMm: 310, slots,
});

test("placing one owned copy rejects a second placement without mutating the layout", () => {
  const pages = [page("a")];
  const result = placeFromLibrary(pages, owned, { pageId: "a", slot: 0 }, 1);
  assert.ok("pages" in result);
  assert.deepEqual(pages[0].slots, []);
  assert.equal(cardAt(result.pages, { pageId: "a", slot: 0 }), 1);
  const duplicate = placeFromLibrary(result.pages, owned, { pageId: "a", slot: 1 }, 1);
  assert.ok("error" in duplicate);
  assert.equal(usageOf(result.pages).get(1), 1);
});

test("library replacement releases the old card and preserves exactly one placement", () => {
  const pages = [page("a", [{ slot: 0, cardId: 1 }])];
  const result = placeFromLibrary(pages, owned, { pageId: "a", slot: 0 }, 2);
  assert.ok("pages" in result);
  assert.equal(result.replacedCardId, 1);
  assert.deepEqual(result.pages[0].slots, [{ slot: 0, cardId: 2 }]);
  assert.deepEqual(pages[0].slots, [{ slot: 0, cardId: 1 }]);
});

test("moving onto an occupied pocket swaps both identities atomically", () => {
  const pages = [page("a", [{ slot: 0, cardId: 1 }, { slot: 1, cardId: 2 }])];
  const result = moveSlot(pages, { pageId: "a", slot: 0 }, { pageId: "a", slot: 1 });
  assert.ok("pages" in result);
  assert.deepEqual(result.pages[0].slots, [{ slot: 0, cardId: 2 }, { slot: 1, cardId: 1 }]);
  assert.deepEqual([...usageOf(result.pages).values()], [1, 1]);
});

test("a cross-spread swap keeps both cards and clears neither by accident", () => {
  const pages = [
    page("a", [{ slot: 0, cardId: 1 }]), page("b"), page("c", [{ slot: 8, cardId: 2 }]),
  ];
  const result = moveSlot(pages, { pageId: "a", slot: 0 }, { pageId: "c", slot: 8 });
  assert.ok("pages" in result);
  assert.equal(cardAt(result.pages, { pageId: "a", slot: 0 }), 2);
  assert.equal(cardAt(result.pages, { pageId: "c", slot: 8 }), 1);
  assert.equal(result.pages[1], pages[1]);
});

test("moving into an empty pocket and clearing it never removes collection records", () => {
  const pages = [page("a", [{ slot: 0, cardId: 1 }])];
  const result = moveSlot(pages, { pageId: "a", slot: 0 }, { pageId: "a", slot: 8 });
  assert.ok("pages" in result);
  assert.equal(cardAt(result.pages, { pageId: "a", slot: 0 }), undefined);
  assert.equal(cardAt(result.pages, { pageId: "a", slot: 8 }), 1);
  assert.deepEqual(clearSlot(result.pages, { pageId: "a", slot: 8 })[0].slots, []);
  assert.equal(owned.size, 2);
});

test("invalid destinations and foreign card IDs cannot alter placements", () => {
  const pages = [page("a", [{ slot: 0, cardId: 1 }])];
  assert.ok("error" in moveSlot(pages, { pageId: "a", slot: 0 }, { pageId: "a", slot: 9 }));
  assert.ok("error" in moveSlot(pages, { pageId: "a", slot: 0 }, { pageId: "missing", slot: 0 }));
  assert.ok("error" in placeFromLibrary(pages, owned, { pageId: "a", slot: 1 }, 999));
  assert.deepEqual(pages[0].slots, [{ slot: 0, cardId: 1 }]);
});

test("shrink preview identifies removed pockets before the explicit resize", () => {
  const original = page("a", [{ slot: 0, cardId: 1 }, { slot: 8, cardId: 2 }]);
  assert.deepEqual(resizePreview(original, 2, 2), [2]);
  const resized = resizePage([original], "a", { rows: 2, columns: 2, widthMm: 180, heightMm: 250 });
  assert.deepEqual(resized[0].slots, [{ slot: 0, cardId: 1 }]);
  assert.equal(resized[0].widthMm, 180);
  assert.equal(original.slots.length, 2);
});

test("dirty comparison ignores slot order and cover-color case but includes dimensions", () => {
  const a = { name: "Binder", style: "ring" as const, coverColor: "#ABCDEF", pages: [
    page("a", [{ slot: 8, cardId: 2 }, { slot: 0, cardId: 1 }]),
  ] };
  const b = { ...a, coverColor: "#abcdef", pages: [
    page("a", [{ slot: 0, cardId: 1 }, { slot: 8, cardId: 2 }]),
  ] };
  assert.equal(serialize(a), serialize(b));
  assert.notEqual(serialize(a), serialize({ ...b, pages: [{ ...b.pages[0], widthMm: 300 }] }));
});

test("new holder pages copy dimensions, not identities or occupied pockets", () => {
  const original = page("a", [{ slot: 0, cardId: 1 }]);
  const first = newPage(original);
  const second = newPage(original);
  assert.notEqual(first.id, second.id);
  assert.notEqual(first.id, original.id);
  assert.equal(first.widthMm, original.widthMm);
  assert.deepEqual(first.slots, []);
});

test("spread bounds support a final single page", () => {
  assert.equal(maxSpread(1), 0);
  assert.equal(maxSpread(2), 0);
  assert.equal(maxSpread(3), 2);
  assert.equal(maxSpread(4), 2);
  assert.equal(maxSpread(60), 58);
});