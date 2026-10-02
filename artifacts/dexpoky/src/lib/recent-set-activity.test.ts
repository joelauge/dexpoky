import assert from "node:assert/strict";
import { test } from "node:test";
import type { PokemonSetSummary } from "@workspace/api-client-react";
import {
  MAX_SET_VISITS, addSetVisit, formatSetActivityTime, getRecentSetActivity, parseSetVisits, setVisitStorageKey,
} from "./recent-set-activity";

const sets: PokemonSetSummary[] = [
  { id: "base1", name: "Base Set", totalCards: 102, catalogSetIds: ["tcgcsv_604"] },
  { id: "base2", name: "Jungle", totalCards: 64 },
  { id: "sv1", name: "Scarlet & Violet", totalCards: 258 },
];
const at = (time: number) => new Date(time).toISOString();

test("history is validated, deduplicated and capped rather than trusting browser storage", () => {
  assert.deepEqual(parseSetVisits("not json"), []);
  assert.deepEqual(parseSetVisits('{"setId":"base1"}'), []);
  const visits = parseSetVisits(JSON.stringify([
    { setId: "base1", visitedAt: 100 }, { setId: "base1", visitedAt: 200 },
    { setId: "base2", visitedAt: 150 }, { setId: "", visitedAt: 300 },
    { setId: "bad", visitedAt: "400" }, { setId: "invalid-date", visitedAt: Number.MAX_VALUE },
  ]));
  assert.deepEqual(visits, [{ setId: "base1", visitedAt: 200 }, { setId: "base2", visitedAt: 150 }]);
  const many = Array.from({ length: 50 }, (_, i) => ({ setId: `set${i}`, visitedAt: i + 1 }));
  assert.equal(parseSetVisits(JSON.stringify(many)).length, MAX_SET_VISITS);
});

test("reopening a set moves its single entry to the front and leaves the original history untouched", () => {
  const before = [{ setId: "base2", visitedAt: 200 }, { setId: "base1", visitedAt: 100 }];
  assert.deepEqual(addSetVisit(before, "base1", 300), [
    { setId: "base1", visitedAt: 300 }, { setId: "base2", visitedAt: 200 },
  ]);
  assert.equal(before[1].visitedAt, 100);
  assert.notEqual(setVisitStorageKey("collector-one"), setVisitStorageKey("collector-two"));
});

test("visits and collection changes are merged and ordered by latest activity, not release dates", () => {
  const result = getRecentSetActivity(sets, [
    { setId: "sv1", createdAt: at(400), updatedAt: at(400) },
    { setId: "base1", createdAt: at(100), updatedAt: at(300) },
  ], [{ setId: "base2", visitedAt: 500 }]);
  assert.deepEqual(result.map((entry) => [entry.set.id, entry.activityAt, entry.kind]), [
    ["base2", 500, "visited"], ["sv1", 400, "added"], ["base1", 300, "updated"],
  ]);
});

test("verified aliases collapse into one expansion with its most recent activity", () => {
  const result = getRecentSetActivity(sets, [
    { catalogCardId: "tcgcsv_604_123", createdAt: at(600), updatedAt: at(600) },
    { catalogCardId: "base1-1", createdAt: at(100), updatedAt: at(200) },
  ], [{ setId: "tcgcsv_604", visitedAt: 500 }, { setId: "base1", visitedAt: 300 }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].set.id, "base1");
  assert.equal(result[0].activityAt, 600);
});

test("an explicit foreign catalog printing cannot appear as a different set through a name fallback", () => {
  const result = getRecentSetActivity(sets, [
    { catalogCardId: "tcgcsv_999_123", setId: "base1", setName: "Base Set", createdAt: at(500), updatedAt: at(500) },
    { catalogCardId: "foreign-1", setName: "Jungle", createdAt: at(600), updatedAt: at(600) },
  ], [{ setId: "removed-set", visitedAt: 700 }]);
  assert.deepEqual(result, []);
});

test("manual and opaque-provider cards can use exact set metadata, but ambiguous names are skipped", () => {
  const withDuplicate = [...sets, { id: "another-base", name: "Base Set", totalCards: 100 }];
  const result = getRecentSetActivity(withDuplicate, [
    { catalogCardId: "pk_opaque", setName: "Jungle", createdAt: at(500), updatedAt: at(500) },
    { setName: "Base Set", createdAt: at(600), updatedAt: at(600) },
  ], []);
  assert.deepEqual(result.map((entry) => entry.set.id), ["base2"]);
});

test("invalid timestamps do not create false activity and the result count stays bounded", () => {
  const result = getRecentSetActivity(sets, [
    { setId: "base1", createdAt: "invalid", updatedAt: "invalid" },
    { setId: "base2", createdAt: "invalid", updatedAt: at(300) },
    { setId: "sv1", createdAt: at(400), updatedAt: "invalid" },
  ], [], 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].set.id, "sv1");
  assert.deepEqual(getRecentSetActivity(sets, [], []), []);
});

test("relative labels handle recent activity and clock skew safely", () => {
  assert.equal(formatSetActivityTime(1000, 2000), "just now");
  assert.equal(formatSetActivityTime(2000, 1000), "just now");
  assert.equal(formatSetActivityTime(1000, 121000), "2 min. ago");
});