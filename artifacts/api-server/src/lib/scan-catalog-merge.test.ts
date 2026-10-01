import { afterEach, describe, expect, it, vi } from "vitest";
import type { PricingData, TcgResult } from "../routes/detect-helpers.js";
import { evaluateSelection } from "./scan-printing-selection.js";
import { mergeScanCatalog } from "./scan-catalog-merge.js";

const emptyPricing: PricingData = {
  marketPrice: null,
  lowPrice: null,
  trendPrice: null,
  source: null,
  psaEstimates: null,
};

const primaryPricing: PricingData = {
  marketPrice: 18,
  lowPrice: 12,
  trendPrice: 16,
  source: "tcgplayer",
  psaEstimates: { 10: 90 },
};

function card(id: string, overrides: Partial<TcgResult> = {}): TcgResult {
  return {
    id,
    name: "Basic Fire Energy",
    imageUrl: `https://images.example.test/${id}.jpg`,
    setName: "Mega Evolution Energies",
    setId: "MEE",
    cardNumber: "002",
    rarity: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mergeScanCatalog", () => {
  it("puts the exact MEE 010 anniversary energy first and uses its catalog identity, art, and price", async () => {
    const original = card("tcgcsv_24461_656264", {
      name: "Basic Fire Energy - 002",
      cardNumber: "002",
    });
    const anniversary = card("tcgcsv_24461_713249", {
      name: "Basic Fire Energy - 010 (30th Celebration)",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/713249_200w.jpg",
      setName: "MEE: Mega Evolution Energies",
      cardNumber: "010",
    });
    const primary = { card: original, variants: [original], pricing: primaryPricing };
    const primarySnapshot = structuredClone(primary);
    const supplementalSnapshot = structuredClone([anniversary]);
    const anniversaryPricing: PricingData = {
      marketPrice: 5,
      lowPrice: 3,
      trendPrice: 4,
      source: "tcgplayer",
      psaEstimates: null,
    };
    const loadPricing = vi.fn(async (_selected: TcgResult) => anniversaryPricing);

    const result = await mergeScanCatalog(
      primary,
      [anniversary],
      { name: "Basic Fire Energy", cardNumber: "010", setCode: "MEE EN" },
      loadPricing,
    );

    expect(result.card).toBe(anniversary);
    expect(result.card).toMatchObject({
      id: "tcgcsv_24461_713249",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/713249_200w.jpg",
      cardNumber: "010",
    });
    expect(result.variants.map(({ id }) => id)).toEqual([
      "tcgcsv_24461_713249",
      "tcgcsv_24461_656264",
    ]);
    expect(result.variants).toContain(original);
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(anniversary);
    expect(result.pricing).toBe(anniversaryPricing);
    expect(result.pricing).not.toBe(primaryPricing);
    expect(primary).toEqual(primarySnapshot);
    expect([anniversary]).toEqual(supplementalSnapshot);
    expect(result.variants).not.toBe(primary.variants);
  });

  it("keeps zero and null fields from the selected printing instead of borrowing primary prices", async () => {
    const original = card("primary-energy", { cardNumber: "002" });
    const anniversary = card("anniversary-energy", { cardNumber: "010" });
    const ownPricing: PricingData = {
      marketPrice: 0,
      lowPrice: null,
      trendPrice: 0,
      source: "tcgplayer",
      psaEstimates: null,
    };
    const loadPricing = vi.fn(async () => ownPricing);

    const result = await mergeScanCatalog(
      { card: original, variants: [original], pricing: primaryPricing },
      [anniversary],
      { name: "Basic Fire Energy", cardNumber: "010", setCode: "MEE" },
      loadPricing,
    );

    expect(result.card).toBe(anniversary);
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(anniversary);
    expect(result.pricing).toEqual(ownPricing);
    expect(result.pricing).not.toEqual(primaryPricing);
  });

  it("keeps all-null pricing for the selected printing rather than borrowing primary prices", async () => {
    const original = card("primary-energy", { cardNumber: "002" });
    const anniversary = card("anniversary-energy", { cardNumber: "010" });
    const loadPricing = vi.fn(async () => emptyPricing);

    const result = await mergeScanCatalog(
      { card: original, variants: [original], pricing: primaryPricing },
      [anniversary],
      { name: "Basic Fire Energy", cardNumber: "010", setCode: "MEE" },
      loadPricing,
    );

    expect(result.pricing).toEqual(emptyPricing);
    expect(result.pricing).not.toEqual(primaryPricing);
  });

  it("uses empty pricing when pricing the selected supplemental card throws", async () => {
    const original = card("primary-energy", { cardNumber: "002" });
    const anniversary = card("anniversary-energy", { cardNumber: "010" });
    const loadPricing = vi.fn(async () => {
      throw new Error("pricing service unavailable");
    });

    const result = await mergeScanCatalog(
      { card: original, variants: [original], pricing: primaryPricing },
      [anniversary],
      { name: "Basic Fire Energy", cardNumber: "010", setCode: "MEE" },
      loadPricing,
    );

    expect(result.card).toBe(anniversary);
    expect(loadPricing).toHaveBeenCalledExactlyOnceWith(anniversary);
    expect(result.pricing).toEqual(emptyPricing);
  });

  it("returns the primary result unchanged and does not load pricing without supplemental cards", async () => {
    const original = card("primary-energy");
    const primary = { card: original, variants: [original], pricing: primaryPricing };
    const loadPricing = vi.fn(async () => emptyPricing);

    const result = await mergeScanCatalog(
      primary,
      [],
      { name: "Basic Fire Energy", cardNumber: "010", setCode: "MEE" },
      loadPricing,
    );

    expect(result).toBe(primary);
    expect(loadPricing).not.toHaveBeenCalled();
  });

  it("deduplicates overlapping IDs, preferring the primary catalog object without mutating inputs", async () => {
    const primaryOriginal = card("shared-id", {
      name: "Basic Fire Energy - original catalog record",
    });
    const secondPrimary = card("second-primary", { cardNumber: "003" });
    const duplicateSupplemental = card("shared-id", {
      name: "Basic Fire Energy - supplemental duplicate",
      imageUrl: "https://images.example.test/supplemental-duplicate.jpg",
    });
    const additionalSupplemental = card("supplemental-only", { cardNumber: "004" });
    const primary = {
      card: primaryOriginal,
      variants: [primaryOriginal, secondPrimary],
      pricing: primaryPricing,
    };
    const primarySnapshot = structuredClone(primary);
    const supplemental = [duplicateSupplemental, additionalSupplemental];
    const supplementalSnapshot = structuredClone(supplemental);
    const loadPricing = vi.fn(async () => emptyPricing);

    const result = await mergeScanCatalog(
      primary,
      supplemental,
      { name: "Basic Fire Energy" },
      loadPricing,
    );

    expect(result.variants.map(({ id }) => id)).toEqual([
      "shared-id",
      "second-primary",
      "supplemental-only",
    ]);
    expect(result.variants[0]).toBe(primaryOriginal);
    expect(result.variants[0]).not.toBe(duplicateSupplemental);
    expect(result.card).toBe(primaryOriginal);
    expect(result.pricing).toBe(primaryPricing);
    expect(loadPricing).not.toHaveBeenCalled();
    expect(primary).toEqual(primarySnapshot);
    expect(supplemental).toEqual(supplementalSnapshot);
  });

  it("does not let a wrong set or wrong name produce an exact printing selection", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const evidence = { name: "Basic Fire Energy", setCode: "MEE EN", cardNumber: "010" };
    const wrongSet = {
      id: "wrong-set-010",
      name: "Basic Fire Energy - 010",
      setId: "OTHER",
      cardNumber: "010",
    };
    const wrongName = {
      id: "tcgcsv_24461_713249",
      name: "Basic Water Energy - 010",
      setId: "MEE",
      cardNumber: "010",
    };

    const wrongSetSelection = await evaluateSelection([wrongSet], evidence, vi.fn() as typeof fetch);
    const wrongNameSelection = await evaluateSelection([wrongName], evidence, vi.fn() as typeof fetch);

    expect(wrongSetSelection.status).toBe("unavailable");
    expect(wrongSetSelection.recommendedId).toBeNull();
    expect(wrongNameSelection.status).toBe("review");
    expect(wrongNameSelection.recommendedId).toBeNull();
  });
});