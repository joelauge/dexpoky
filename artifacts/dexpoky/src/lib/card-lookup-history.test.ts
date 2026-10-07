import assert from "node:assert/strict";
import { test } from "node:test";
import { addLookupHistory, lookupHistoryPage, lookupHistoryStorageKey, parseLookupHistory, type LookupHistoryEntry } from "./card-lookup-history";

const entry = (id: string, visitedAt = 1000): LookupHistoryEntry => ({
  card: { id, name: "Pikachu", setName: "Base Set", cardNumber: "58", imageUrl: "https://assets.tcgdex.net/card.webp" },
  finish: "normal", condition: "near_mint", visitedAt,
});
test("history paginates at ten cards without discarding older lookups", () => {
  let history: LookupHistoryEntry[] = [];
  for (let i = 0; i < 25; i++) history = addLookupHistory(history, entry(String(i), 1000 + i));
  assert.equal(history.length, 25);
  assert.equal(lookupHistoryPage(history, 1).entries.length, 10);
  assert.equal(lookupHistoryPage(history, 2).entries.length, 10);
  assert.equal(lookupHistoryPage(history, 3).entries.length, 5);
  assert.equal(lookupHistoryPage(history, 1).entries[0].card.id, "24");
  assert.equal(lookupHistoryPage(history, 99).page, 3);
  assert.equal(lookupHistoryPage([], -1).page, 1);
});
test("repeat lookup updates latest settings and moves the same printing to the front", () => {
  const history = addLookupHistory([entry("a", 1000), entry("b", 2000)], { ...entry("a", 3000), finish: "holofoil", condition: "mint" });
  assert.equal(history.length, 2);
  assert.equal(history[0].card.id, "a");
  assert.equal(history[0].finish, "holofoil");
  assert.equal(history[0].condition, "mint");
  assert.deepEqual(parseLookupHistory(JSON.stringify(history)), history);
  const withoutArtwork = { ...entry("a", 4000), card: { ...entry("a").card, imageUrl: null } };
  assert.equal(addLookupHistory(history, withoutArtwork)[0].card.imageUrl, history[0].card.imageUrl);
});
test("storage parsing rejects corrupt data and unsafe images", () => {
  for (const raw of ["bad json", "{}", "[null]", JSON.stringify([{ ...entry("a"), visitedAt: -1 }]), JSON.stringify([{ ...entry("a"), visitedAt: 1e100 }])]) assert.deepEqual(parseLookupHistory(raw), []);
  const unsafe = entry("a"); unsafe.card.imageUrl = "javascript:alert(1)";
  assert.equal(parseLookupHistory(JSON.stringify([unsafe]))[0].card.imageUrl, null);
  assert.equal(parseLookupHistory(JSON.stringify([entry("a"), entry("a")])).length, 1);
  assert.notEqual(lookupHistoryStorageKey("one"), lookupHistoryStorageKey("two"));
});
