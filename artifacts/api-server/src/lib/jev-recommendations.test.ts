import { describe, expect, it, vi, afterEach } from "vitest";
import { recommendCard } from "./jev-recommendations.js";

const input = {
  card: { id: 7, name: "Pikachu", catalogCardId: "set-7", estimatedValue: 150, listingPrice: null, condition: "near_mint", forSale: false, imageUrl: null },
  duplicateCount: 2, deckUses: 1, wishlistMatch: false,
};

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("recommendCard", () => {
  it("falls back safely without a TypeSafe key", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const result = await recommendCard(input, "collector");
    expect(result.unavailable).toBe(true);
    expect(result.recommendations).toHaveLength(6);
    expect(result.recommendations[0].informational).toBe(true);
  });
  it("validates and uses a single cached Jev response across profiles", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "test-model",
       answers: Object.fromEntries(["keep", "play", "sell", "trade", "grade", "watch"].map((action) => [action, { type: "score", score: 2, confidence: .9, probabilities: { "0": 0, "1": 0.1, "2": 0.9 } }])),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await recommendCard({ ...input, card: { ...input.card, id: 8 } }, "collector");
    await recommendCard({ ...input, card: { ...input.card, id: 8 } }, "seller");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("falls back informationally after a user's cold-call budget is exhausted", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "test-model",
      answers: Object.fromEntries(["keep", "play", "sell", "trade", "grade", "watch"].map((action) => [action, {
        type: "score",
        score: 1,
        confidence: .8,
        probabilities: { "0": 0.1, "1": 0.8, "2": 0.1 },
      }])),
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    const results = [];
    for (let id = 100; id < 111; id += 1) {
      results.push(await recommendCard(
        { ...input, card: { ...input.card, id } },
        "collector",
        "quota-test-user",
      ));
    }

    expect(fetch).toHaveBeenCalledTimes(10);
    expect(results.at(-1)?.unavailable).toBe(true);
    expect(results.at(-1)?.recommendations.every((item) => item.informational)).toBe(true);
  });
});