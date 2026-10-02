import { describe, expect, it } from "vitest";
import { buildPortfolioBreakdowns, type PortfolioCard } from "./portfolio-breakdowns.js";
import type { PortfolioMetadataResult } from "./portfolio-catalog-metadata.js";

const metadata: PortfolioMetadataResult = {
  years: new Map([["sv01", "2023"]]), types: new Map([["sv01-1", "Pokémon"]]),
  pending: false, unavailable: false,
};
function card(id: number, overrides: Partial<PortfolioCard> = {}): PortfolioCard {
  return {
    id, pokemonName: "Pikachu", setId: "sv01", setName: "Scarlet & Violet",
    catalogCardId: "sv01-1", categoryId: 1, categoryName: "Favorites",
    estimatedValue: "12.35", forSale: false, rarity: "rare", condition: "near_mint",
    ...overrides,
  };
}
describe("portfolio value dimensions", () => {
  it("partitions every owned view without including wishlist value or replacing estimates with asking prices", () => {
    const result = buildPortfolioBreakdowns(
      [card(1, { forSale: true }), card(2, { estimatedValue: "0.10" }), card(3, { estimatedValue: null, setId: null, setName: null, catalogCardId: null })],
      [{ id: 4, setName: "Base", setCode: "base1", lastSeenPrice: "250.00" }],
      [], metadata,
    );
    expect(result.ownedValue).toBe(12.45);
    expect(result.wishlistValue).toBe(250);
    expect(result.dimensions).toHaveLength(10);
    for (const dimension of result.dimensions.filter((entry) => entry.scope === "owned")) {
      expect(dimension.groups.reduce((sum, group) => sum + group.cardCount, 0)).toBe(3);
      expect(Math.round(dimension.groups.reduce((sum, group) => sum + group.totalValue, 0) * 100)).toBe(1245);
      expect(dimension.unvaluedCount).toBe(1);
    }
    expect(result.dimensions.find((entry) => entry.key === "sale_status")?.groups.find((group) => group.key === "for_sale")?.totalValue).toBe(12.35);
    expect(result.dimensions.find((entry) => entry.key === "year")?.groups.map((group) => group.label)).toEqual(["2023", "Unavailable"]);
  });
  it("deduplicates repeated binder placements while explaining cross-binder overlap", () => {
    const result = buildPortfolioBreakdowns([card(1), card(2)], [], [
      { cardId: 1, binderId: 10, binderName: "Keepers" },
      { cardId: 1, binderId: 10, binderName: "Keepers" },
      { cardId: 1, binderId: 20, binderName: "Trades" },
      { cardId: 99, binderId: 30, binderName: "Other owner's card" },
    ], metadata);
    const binder = result.dimensions.find((entry) => entry.key === "binder")!;
    expect(binder.cardCount).toBe(2);
    expect(binder.totalValue).toBe(24.7);
    expect(binder.groups).toHaveLength(3);
    expect(binder.groups.every((group) => group.cardCount === 1)).toBe(true);
    expect(binder.note).toContain("overlap");
    expect(binder.groups.some((group) => group.label.includes("Other owner"))).toBe(false);
  });
  it("distinguishes missing prices from legitimate zero and returns truthful empty states", () => {
    const result = buildPortfolioBreakdowns([card(1, { estimatedValue: 0 }), card(2, { estimatedValue: "bad" })],
      [{ id: 3, setCode: null, setName: null, lastSeenPrice: null }], [], metadata);
    expect(result.ownedValue).toBe(0);
    expect(result.dimensions[0].unvaluedCount).toBe(1);
    expect(result.dimensions.find((entry) => entry.key === "wishlist")?.unvaluedCount).toBe(1);
    const empty = buildPortfolioBreakdowns([], [], [], metadata);
    expect(empty.dimensions.every((entry) => entry.groups.length === 0 && entry.totalValue === 0)).toBe(true);
  });
  it("keeps same-named categories and binders with different identities distinct", () => {
    const result = buildPortfolioBreakdowns([card(1), card(2, { categoryId: 2 })], [],
      [{ cardId: 1, binderId: 1, binderName: "Cards" }, { cardId: 2, binderId: 2, binderName: "Cards" }], metadata);
    expect(result.dimensions[0].groups).toHaveLength(2);
    expect(result.dimensions.find((entry) => entry.key === "binder")?.groups).toHaveLength(2);
  });
});