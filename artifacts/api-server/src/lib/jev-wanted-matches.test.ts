import { afterEach, describe, expect, it, vi } from "vitest";
import { deterministicWantedMatches, rerankWantedMatches, shouldSendUrgentWantedNotification, type WantedCandidate, type WantedIntent } from "./jev-wanted-matches.js";

const intent: WantedIntent = {
  catalogCardId: "sv1-25",
  name: "Pikachu",
  pokemonName: "Pikachu",
  setName: "Scarlet & Violet",
  cardNumber: "25",
  maxPrice: 50,
  preferences: null,
};
const candidate = (overrides: Partial<WantedCandidate> = {}): WantedCandidate => ({
  listingId: 1,
  cardId: 10,
  catalogCardId: "sv1-25",
  name: "Pikachu",
  pokemonName: "Pikachu",
  setName: "Scarlet & Violet",
  cardNumber: "25",
  rarity: "rare",
  condition: "near_mint",
  price: 40,
  description: null,
  ...overrides,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("wanted match reranking", () => {
  it("keeps exact-printing behavior when there are no semantic preferences", async () => {
    const matches = await rerankWantedMatches(intent, [
      candidate({ listingId: 2, catalogCardId: "sv2-1", price: 10 }),
      candidate({ listingId: 1 }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ listingId: 1, exactPrinting: true, label: "Strong match" });
  });

  it("reranks only the supplied eligible candidates and labels ambiguity", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: {
        listing_1: { score: 1, confidence: .45, probabilities: { "0": .2, "1": .6, "2": .2 } },
        listing_2: { score: 2, confidence: .9, probabilities: { "0": .01, "1": .09, "2": .9 } },
      },
    }), { status: 200 })));
    const matches = await rerankWantedMatches(
      { ...intent, preferences: "Prefer lightly played copies from the cheaper set" },
      [candidate(), candidate({ listingId: 2, catalogCardId: "sv2-1", setName: "Paldea Evolved", condition: "light_played" })],
    );
    expect(matches.map((match) => match.listingId)).toEqual([2, 1]);
    expect(matches[1].label).toBe("Near match");
    expect(shouldSendUrgentWantedNotification(matches[1], true)).toBe(false);
  });

  it("falls back deterministically when Jev is unavailable", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const matches = await rerankWantedMatches({ ...intent, preferences: "mint only" }, [candidate()]);
    expect(matches[0]).toMatchObject({ exactPrinting: true, relevance: 1, confidence: 0, label: "Near match" });
    expect(shouldSendUrgentWantedNotification(matches[0], true)).toBe(false);
  });

  it("sorts exact, near, and ambiguous deterministic matches predictably", () => {
    const matches = deterministicWantedMatches(intent, [
      candidate({ listingId: 3, catalogCardId: "other", setName: "Other" }),
      candidate({ listingId: 2, catalogCardId: "other", setName: intent.setName }),
      candidate({ listingId: 1 }),
    ]);
    expect(matches.map((match) => match.listingId)).toEqual([1]);
  });

  it("uses the canonical API contract and rejects malformed answers", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answers: { listing_1: { score: Number.NaN, confidence: .9 } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const matches = await rerankWantedMatches({ ...intent, preferences: "mint only" }, [candidate()]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.typesafe.ai/v1/systemone");
    expect(matches[0]).toMatchObject({ confidence: 0, label: "Near match" });
  });

  it("excludes wrong identities and over-budget listings before reranking", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const matches = await rerankWantedMatches({ ...intent, preferences: "mint only" }, [
      candidate({ listingId: 1 }),
      candidate({ listingId: 2, price: 51 }),
      candidate({ listingId: 3, pokemonName: "Raichu" }),
    ]);
    expect(matches.map((match) => match.listingId)).toEqual([1]);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(Object.keys(body.questions)).toEqual(["listing_1"]);
  });

  it("retains an exact match beyond the first 50 eligible same-Pokémon listings", async () => {
    const pool = Array.from({ length: 60 }, (_, index) =>
      candidate({
        listingId: index + 1,
        catalogCardId: index === 59 ? intent.catalogCardId : `near-${index}`,
        setName: index === 59 ? intent.setName : "Other",
      }),
    );
    const matches = await rerankWantedMatches(intent, pool);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ listingId: 60, exactPrinting: true });
  });
});