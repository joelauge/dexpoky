import { afterEach, describe, expect, it, vi } from "vitest";
import { isAmbiguousNaturalLanguage, rerankCatalogCandidates } from "./catalog-reranker.js";
import type { NormalizedCatalogCard } from "./pokewallet.js";

const cards: NormalizedCatalogCard[] = [
  { id: "a", name: "Charizard", pokemonName: "Charizard", setName: "Base", setCode: "base1", cardNumber: "4", rarity: "Rare", imageUrl: "", marketPrice: null, tcgplayerUrl: null, cardmarketUrl: null },
  { id: "b", name: "Charmander", pokemonName: "Charmander", setName: "Base", setCode: "base1", cardNumber: "46", rarity: "Common", imageUrl: "", marketPrice: null, tcgplayerUrl: null, cardmarketUrl: null },
];

afterEach(() => vi.unstubAllEnvs());

describe("catalog Jev reranking", () => {
  it("skips exact IDs, set-number identities, and ordinary prefixes unchanged", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetcher = vi.fn();
    for (const query of ["base1-4", "base1 4", "chari"]) {
      const result = await rerankCatalogCandidates(query, cards, fetcher as typeof fetch);
      expect(result).toEqual({ results: cards, status: "skipped" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns deterministic order when Jev exceeds its strict budget", async () => {
    vi.useFakeTimers();
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const pending = rerankCatalogCandidates("old fire dragon from base", cards, fetcher as typeof fetch);
    await vi.advanceTimersByTimeAsync(181);
    await expect(pending).resolves.toEqual({ results: cards, status: "fallback" });
    vi.useRealTimers();
  });

  it("only classifies descriptive free text as ambiguous", () => {
    expect(isAmbiguousNaturalLanguage("old fire dragon from base")).toBe(true);
    expect(isAmbiguousNaturalLanguage("charizard")).toBe(false);
    expect(isAmbiguousNaturalLanguage("base1 4")).toBe(false);
  });
});
