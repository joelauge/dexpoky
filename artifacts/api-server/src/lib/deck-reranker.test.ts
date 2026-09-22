import { afterEach, describe, expect, it } from "vitest";
import { enforceLegalCandidateLimits, rankLegalDeckCandidates } from "./deck-reranker.js";

afterEach(() => {
  delete process.env.TYPESAFE_API_KEY;
});

describe("enforceLegalCandidateLimits", () => {
  it("enforces copy, Radiant, ACE SPEC, Prism Star, and deck-size limits using real card names", () => {
    const result = enforceLegalCandidateLimits([
      { name: "Pikachu", count: 8 },
      { name: "Double Turbo Energy", count: 8 },
      { name: "Jet Energy", count: 8 },
      { name: "Radiant Charizard", count: 2 },
      { name: "Radiant Greninja", count: 1 },
      { name: "Prime Catcher", rarity: "ACE SPEC Rare", count: 3 },
      { name: "Hero's Cape", rarity: "ACE SPEC Rare", count: 1 },
      { name: "Ditto ◇", rarity: "Rare Prism Star", count: 3 },
      { name: "Ditto ◇", rarity: "Rare Prism Star", count: 2 },
      { name: "Fire Energy", count: 80 },
    ]);

    expect(result).toEqual([
      { name: "Pikachu", count: 4 },
      { name: "Double Turbo Energy", count: 4 },
      { name: "Jet Energy", count: 4 },
      { name: "Radiant Charizard", count: 1 },
      { name: "Prime Catcher", rarity: "ACE SPEC Rare", count: 1 },
      { name: "Ditto ◇", rarity: "Rare Prism Star", count: 1 },
      { name: "Fire Energy", count: 45 },
    ]);
    expect(result.reduce((sum, card) => sum + card.count, 0)).toBe(60);
  });
});

describe("rankLegalDeckCandidates", () => {
  it("returns an explicit low-confidence fallback when TypeSafe is unavailable", async () => {
    const result = await rankLegalDeckCandidates([
      {
        key: "owned:1",
        source: "owned",
        name: "Pikachu",
        count: 2,
        role: "attacker",
        reason: "Primary attacker",
        originalIndex: 0,
      },
    ], "aggro");

    expect(result.unavailable).toBe(true);
    expect(result.rankings.get("owned:1")).toMatchObject({
      confidence: 0,
      uncertain: true,
      overall: .5,
    });
  });
});