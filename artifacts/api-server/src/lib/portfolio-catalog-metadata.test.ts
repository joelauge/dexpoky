import { describe, expect, it, vi } from "vitest";
import {
  createPortfolioMetadataLoader,
  loadPortfolioMetadata,
  type PortfolioCatalogInput,
  type PortfolioMetadataLoaderOptions,
} from "./portfolio-catalog-metadata.js";
import type { PokeWalletCard, PokeWalletResult } from "./pokewallet.js";

function createTestLoader(options: PortfolioMetadataLoaderOptions = {}) {
  return createPortfolioMetadataLoader({
    resolveTcgcsvCategory: async () => null,
    lookupPokeWalletCard: async () => null,
    ...options,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("portfolio catalog metadata", () => {
  it("maps exact TCGdex Pokemon, Trainer, and Energy categories", async () => {
    const calls: string[] = [];
    const loader = createTestLoader({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        const id = decodeURIComponent(url.split("/cards/")[1] ?? "");
        const categories: Record<string, string> = {
          "sv09-001": "Pokemon",
          "sv09-002": "Trainer",
          "sv09-003": "Energy",
          "sv09-004": "Pokemon TCG",
        };
        return jsonResponse({ id, category: categories[id] });
      },
    });

    const result = await loader.loadPortfolioMetadata(
      ["sv09-001", "sv09-002", "sv09-003", "sv09-004"].map((catalogCardId) => ({ catalogCardId })),
      "card_type",
    );

    expect(result.types).toEqual(new Map([
      ["sv09-001", "Pokemon"],
      ["sv09-002", "Trainer"],
      ["sv09-003", "Energy"],
      ["sv09-004", "Unknown"],
    ]));
    expect(result.unavailable).toBe(false);
    expect(calls).toHaveLength(4);
  });

  it("unwraps prefixed TCGdex IDs and leaves unsupported catalog namespaces Unknown", async () => {
    const calls: string[] = [];
    const loader = createTestLoader({
      fetchImpl: async (input) => {
        calls.push(String(input));
        return jsonResponse({ category: "Trainer" });
      },
    });
    const result = await loader.loadPortfolioMetadata([
      { catalogCardId: "tcgdex_sv09-001" },
      { catalogCardId: "tcgcsv_12_34" },
      { catalogCardId: "unrecognized-card-id" },
    ], "card_type");

    expect(result.types).toEqual(new Map([
      ["tcgdex_sv09-001", "Trainer"],
      ["tcgcsv_12_34", "Unknown"],
      ["unrecognized-card-id", "Unknown"],
    ]));
    expect(calls).toEqual(["https://api.tcgdex.net/v2/en/cards/sv09-001"]);
  });

  it("maps exact PokeWallet categories and requires structured evidence for elemental types", async () => {
    const walletTypes: Record<string, { card_type: string; card_number?: string; hp?: string; stage?: string }> = {
      "pk_pokemon": { card_type: "Pokémon" },
      "pk_trainer": { card_type: "Supporter" },
      "pk_energy": { card_type: "Special Energy" },
      "pk_elemental": { card_type: "Fire", card_number: "12", hp: "60", stage: "Basic" },
      "pk_no_stats": { card_type: "Fire", card_number: "12", hp: "60" },
      "pk_unrecognized": { card_type: "Pokemon Trainer" },
    };
    const loader = createTestLoader({
      lookupPokeWalletCard: async (id) => {
        const info = walletTypes[id];
        if (!info) return null;
        const data: PokeWalletCard = {
          id,
          card_info: { name: "Card", ...info },
        };
        return { ok: true, data, remainingHour: null, remainingDay: null };
      },
    });
    const ids = Object.keys(walletTypes);
    const result = await loader.loadPortfolioMetadata(
      ids.map((catalogCardId) => ({ catalogCardId })),
      "card_type",
    );

    expect(result.types).toEqual(new Map([
      ["pk_pokemon", "Pokemon"],
      ["pk_trainer", "Trainer"],
      ["pk_energy", "Energy"],
      ["pk_elemental", "Pokemon"],
      ["pk_no_stats", "Unknown"],
      ["pk_unrecognized", "Unknown"],
    ]));
    expect(result.unavailable).toBe(false);
  });

  it("uses the injectable cached TCGCSV category helper for TCGCSV catalog IDs", async () => {
    const resolveTcgcsvCategory = vi.fn(async () => "Energy" as const);
    const lookupPokeWalletCard = vi.fn(async () => null);
    const loader = createTestLoader({ resolveTcgcsvCategory, lookupPokeWalletCard });

    const result = await loader.loadPortfolioMetadata(
      [{ catalogCardId: "tcgcsv_12_34" }],
      "card_type",
    );

    expect(result.types.get("tcgcsv_12_34")).toBe("Energy");
    expect(result.unavailable).toBe(false);
    expect(resolveTcgcsvCategory).toHaveBeenCalledExactlyOnceWith("tcgcsv_12_34");
    expect(lookupPokeWalletCard).not.toHaveBeenCalled();
  });

  it("keeps an unrecognized catalog ID Unknown when the injectable PokeWallet lookup has no result", async () => {
    const lookupPokeWalletCard = vi.fn(async (): Promise<PokeWalletResult<PokeWalletCard> | null> => null);
    const loader = createTestLoader({ lookupPokeWalletCard });

    const result = await loader.loadPortfolioMetadata(
      [{ catalogCardId: "unrecognized-card-id" }],
      "card_type",
    );

    expect(result.types.get("unrecognized-card-id")).toBe("Unknown");
    expect(result.unavailable).toBe(true);
    expect(lookupPokeWalletCard).toHaveBeenCalledExactlyOnceWith("unrecognized-card-id");
  });

  it("reuses cached type details across repeated calls", async () => {
    let calls = 0;
    const loader = createTestLoader({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ category: "Pokemon" });
      },
    });

    await loader.loadPortfolioMetadata([{ catalogCardId: "sv09-001" }], "card_type");
    await loader.loadPortfolioMetadata([{ catalogCardId: "sv09-001" }], "card_type");

    expect(calls).toBe(1);
  });

  it("caches provider failures briefly, returns Unknown, and does not throw", async () => {
    let now = 100;
    let calls = 0;
    const loader = createTestLoader({
      now: () => now,
      negativeCacheTtlMs: 50,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("TCGdex unavailable");
      },
    });
    const cards = [{ catalogCardId: "sv09-001" }];

    const first = await loader.loadPortfolioMetadata(cards, "card_type");
    const second = await loader.loadPortfolioMetadata(cards, "card_type");
    expect(first.types.get("sv09-001")).toBe("Unknown");
    expect(first.unavailable).toBe(true);
    expect(second.unavailable).toBe(true);
    expect(calls).toBe(1);

    now += 51;
    await loader.loadPortfolioMetadata(cards, "card_type");
    expect(calls).toBe(2);
  });

  it("matches a TCGCSV set by exact normalized name and uses detail releaseDate only", async () => {
    const calls: string[] = [];
    const loader = createTestLoader({
      fetchImpl: async (input) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith("/sets")) {
          return jsonResponse([
            { id: "sv09", name: "Journey Together" },
            { id: "sv08", name: "Journey Together Promo" },
          ]);
        }
        if (url.endsWith("/sets/sv09")) {
          return jsonResponse({ id: "sv09", releaseDate: "2025-03-28", modified: "2037-01-01" });
        }
        return jsonResponse({}, 404);
      },
    });

    const result = await loader.loadPortfolioMetadata([{
      setId: "tcgcsv_20",
      setName: "  JOURNEY   TOGETHER ",
    }], "year");

    expect(result.years).toEqual(new Map([["tcgcsv_20", "2025"]]));
    expect(calls).toEqual([
      "https://api.tcgdex.net/v2/en/sets",
      "https://api.tcgdex.net/v2/en/sets/sv09",
    ]);
    expect(result.unavailable).toBe(false);
  });

  it("uses a native TCGdex set ID directly without consulting the set index", async () => {
    const calls: string[] = [];
    const loader = createTestLoader({
      fetchImpl: async (input) => {
        calls.push(String(input));
        return jsonResponse({ releaseDate: "2024-09-13" });
      },
    });
    const result = await loader.loadPortfolioMetadata([{ setId: "sv08" }], "year");

    expect(result.years).toEqual(new Map([["sv08", "2024"]]));
    expect(calls).toEqual(["https://api.tcgdex.net/v2/en/sets/sv08"]);
  });

  it("does not fetch metadata for other dimensions", async () => {
    let calls = 0;
    const cards: PortfolioCatalogInput[] = [
      { catalogCardId: "sv09-001", setId: "sv09", setName: "Journey Together" },
    ];
    const loader = createTestLoader({
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });

    const result = await loader.loadPortfolioMetadata(cards, "category");
    expect(result).toEqual({
      years: new Map(),
      types: new Map(),
      pending: false,
      unavailable: false,
    });
    expect(calls).toBe(0);
    await expect(loadPortfolioMetadata(cards, "default")).resolves.toMatchObject({
      pending: false,
      unavailable: false,
    });
    expect(calls).toBe(0);
  });

  it("limits misses per request and reports unresolved supported keys as pending", async () => {
    const calls: string[] = [];
    const loader = createTestLoader({
      maxMissesPerRequest: 2,
      fetchImpl: async (input) => {
        calls.push(String(input));
        return jsonResponse({ category: "Pokemon" });
      },
    });
    const result = await loader.loadPortfolioMetadata(
      ["sv09-001", "sv09-002", "sv09-003"].map((catalogCardId) => ({ catalogCardId })),
      "card_type",
    );

    expect(calls).toHaveLength(2);
    expect(result.pending).toBe(true);
    expect(result.types.get("sv09-003")).toBe("Unknown");
  });

  it("aborts in-flight work at the request deadline and does not start set detail afterward", async () => {
    const calls: string[] = [];
    let aborted = false;
    const loader = createTestLoader({
      requestBudgetMs: 15,
      fetchImpl: async (input, init) => {
        calls.push(String(input));
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          }, { once: true });
        });
      },
    });

    await loader.loadPortfolioMetadata([{
      setId: "tcgcsv_20",
      setName: "Journey Together",
    }], "year");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(aborted).toBe(true);
    expect(calls).toEqual(["https://api.tcgdex.net/v2/en/sets"]);
  });
});