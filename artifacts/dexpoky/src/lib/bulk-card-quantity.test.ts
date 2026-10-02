import assert from "node:assert/strict";
import { test } from "node:test";
import { expandBulkCardCopies, parseBulkCardQuantity } from "./bulk-card-quantity.ts";

test("defaults to one copy and accepts whole quantities", () => {
  assert.equal(parseBulkCardQuantity(undefined), 1);
  assert.equal(parseBulkCardQuantity("1"), 1);
  assert.equal(parseBulkCardQuantity("3"), 3);
  assert.equal(parseBulkCardQuantity("999"), 999);
});

test("rejects empty, zero, negative, fractional, and oversized quantities", () => {
  for (const value of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "1000", "1e2"]) {
    assert.equal(parseBulkCardQuantity(value), null, value);
  }
});

test("expands each card into separate copies without changing per-copy metadata", () => {
  const cards = [
    { catalogCardId: "set-1", estimatedValue: 5, originalScanUrl: "/photo", collectionId: 7 },
    { catalogCardId: "set-2", estimatedValue: 2, originalScanUrl: null, collectionId: 7 },
  ];
  const expanded = expandBulkCardCopies(cards, ["3", "2"]);
  assert.equal(expanded.length, 5);
  assert.deepEqual(expanded.slice(0, 3), [cards[0], cards[0], cards[0]]);
  assert.deepEqual(expanded.slice(3), [cards[1], cards[1]]);
  assert.notEqual(expanded[0], expanded[1]);
  assert.deepEqual(expandBulkCardCopies(cards, []), cards);
  assert.throws(() => expandBulkCardCopies(cards, ["0", "1"]));
});