import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeSpreadPageIndexes,
  adjacentSpreadPageIndexes,
  pageGeometrySignature,
  stablePageCompositionKey,
  updatePageCompositionLru,
} from "./binder-page-window.ts";

test("adjacent spread window is bounded at the first and last spread", () => {
  assert.deepEqual(adjacentSpreadPageIndexes(10, 0), [0, 1, 2, 3]);
  assert.deepEqual(adjacentSpreadPageIndexes(10, 8), [6, 7, 8, 9]);
  assert.deepEqual(adjacentSpreadPageIndexes(2, 0), [0, 1]);
  assert.deepEqual(adjacentSpreadPageIndexes(0, 0), []);
});

test("spread window supports custom page counts and adjacent spread counts", () => {
  assert.deepEqual(adjacentSpreadPageIndexes(11, 3, 3, 1), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(adjacentSpreadPageIndexes(11, 6, 3, 2), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(activeSpreadPageIndexes(5, 3, 3), [3, 4]);
});

test("page identity stays stable while geometry signatures invalidate layout replacements", () => {
  const original = { id: "p1", rows: 3, columns: 3, widthMm: 210, heightMm: 297 };
  const resized = { ...original, widthMm: 230 };
  assert.equal(stablePageCompositionKey(original), stablePageCompositionKey(resized));
  assert.notEqual(stablePageCompositionKey(original, "binder-a"), stablePageCompositionKey(original, "binder-b"));
  assert.notEqual(pageGeometrySignature(original), pageGeometrySignature(resized));
  assert.equal(pageGeometrySignature(original), pageGeometrySignature({ ...original }));
});

test("bounded page composition LRU retains overlap and evicts pages outside the window", () => {
  const firstWindow = ["p0", "p1", "p2", "p3", "p4", "p5"];
  const composed = updatePageCompositionLru([], firstWindow, ["p0", "p1"], 6, true);
  const shifted = updatePageCompositionLru(composed, ["p2", "p3", "p4", "p5", "p6", "p7"], ["p2", "p3"], 6);
  assert.deepEqual(shifted, ["p4", "p5", "p2", "p3"]);
  const idleComposed = updatePageCompositionLru(shifted, ["p2", "p3", "p4", "p5", "p6", "p7"], ["p2", "p3"], 6, true);
  assert.deepEqual(idleComposed, ["p4", "p5", "p6", "p7", "p2", "p3"]);
  assert.ok(idleComposed.length <= 6);
});