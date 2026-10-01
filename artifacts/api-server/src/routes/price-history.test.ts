import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRepriceAction, buildTcgdexId, classifyReprice, fetchExactPrice } from "./price-history.js";

const { mockGetTcgcsvPricing, mockFetchPricingById } = vi.hoisted(() => ({
  mockGetTcgcsvPricing: vi.fn(),
  mockFetchPricingById: vi.fn(),
}));

vi.mock("../lib/tcgcsv.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/tcgcsv.js")>(),
  getTcgcsvPricing: mockGetTcgcsvPricing,
}));

vi.mock("./detect-helpers.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("./detect-helpers.js")>(),
  fetchPricingById: mockFetchPricingById,
}));

beforeEach(() => {
  mockGetTcgcsvPricing.mockReset();
  mockFetchPricingById.mockReset();
});

describe("collection repricing", () => {
  it("classifies exact prices as corrected, unchanged, or unresolved", () => {
    expect(classifyReprice(100, 2.5, "resolved")).toBe("corrected");
    expect(classifyReprice(2.5, 2.5, "resolved")).toBe("unchanged");
    expect(classifyReprice(null, 2.5, "resolved")).toBe("corrected");
    expect(classifyReprice(100, null, "unresolved")).toBe("unresolved");
    expect(classifyReprice(100, null, "unavailable")).toBe("unavailable");
    expect(classifyReprice(100, null, "resolved")).toBe("unavailable");
  });

  it("only builds deterministic printing identities", () => {
    expect(buildTcgdexId("sv1-025", null, null, null)).toBe("sv1-025");
    expect(buildTcgdexId(null, "sv1", null, "025")).toBe("sv1-025");
    expect(buildTcgdexId(null, null, "Unknown Set", "025")).toBeNull();
    expect(buildTcgdexId(null, null, "Silver Tempest", "025")).toBe("swsh12-025");
    expect(buildTcgdexId("tcgcsv_123_456", "sv1", "Scarlet & Violet", "025")).toBeNull();
  });

  it("uses a TCGCSV identity's own price without constructing a TCGdex lookup", async () => {
    mockGetTcgcsvPricing.mockResolvedValue({
      marketPrice: 17.5,
      lowPrice: 14,
      trendPrice: 16,
      source: "tcgplayer",
      psaEstimates: null,
    });

    const card = {
      id: 1,
      name: "Pikachu",
      pokemonName: "Pikachu",
      cardNumber: "025",
      setName: "Scarlet & Violet",
      setId: "sv1",
      catalogCardId: "tcgcsv_123_456",
      rarity: null,
      estimatedValue: null,
    };

    await expect(fetchExactPrice(card)).resolves.toMatchObject({
      marketPrice: 17.5,
      source: "tcgplayer",
      identity: "tcgcsv_123_456",
      status: "resolved",
    });
    expect(mockGetTcgcsvPricing).toHaveBeenCalledWith("tcgcsv_123_456");
    expect(mockFetchPricingById).not.toHaveBeenCalled();
  });

  it("clears only confirmed unresolved values and preserves transient failures", () => {
    expect(buildRepriceAction(99, null, "unresolved")).toEqual({
      outcome: "unresolved",
      clearValue: true,
    });
    expect(buildRepriceAction(99, null, "unavailable")).toEqual({
      outcome: "unavailable",
      preserveValue: true,
    });
  });

  it("updates only when the exact printing value changed", () => {
    expect(buildRepriceAction(99, 3.25, "resolved")).toEqual({
      outcome: "corrected",
      value: 3.25,
    });
    expect(buildRepriceAction(3.25, 3.25, "resolved")).toEqual({
      outcome: "unchanged",
    });
  });
});