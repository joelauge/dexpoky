import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card } from "@workspace/api-client-react";
import { findTargets } from "./card-lookup-utils.ts";

const base = {
  id: 3,
  name: "Charizard",
  setName: "Base Set",
  cardNumber: "4/102",
  catalogCardId: "pk_base_4",
  edition: "first_edition",
  createdAt: "2024-01-01T00:00:00.000Z",
} as Card;

test("findTargets only offers copies with the explicitly selected edition", () => {
  const unlimited = { ...base, id: 4, edition: "unlimited" } as Card;
  const matches = findTargets([base, unlimited], {
    id: "pk_base_4",
    name: "Charizard",
    setName: "Base Set",
    cardNumber: "4/102",
  }, "first_edition");

  assert.deepEqual(matches.targets.map(({ card }) => card.id), [3]);
  assert.deepEqual(matches.identityCandidates.map(({ card }) => card.id), [4]);
});

test("unknown edition does not match a known owned edition", () => {
  const matches = findTargets([base], {
    id: "pk_base_4",
    name: "Charizard",
    setName: "Base Set",
    cardNumber: "4/102",
  }, "unknown");

  assert.deepEqual(matches.targets, []);
  assert.deepEqual(matches.identityCandidates.map(({ card }) => card.id), [3]);
});