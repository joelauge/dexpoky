import { GetPortfolioBreakdownsResponse } from "@workspace/api-zod";
import type { z } from "zod";
import type { PortfolioCatalogInput, PortfolioMetadataResult } from "./portfolio-catalog-metadata.js";

type Result = z.infer<typeof GetPortfolioBreakdownsResponse>;
type Dimension = Result["dimensions"][number];
type Group = Dimension["groups"][number];
export interface PortfolioCard extends PortfolioCatalogInput {
  id: number;
  pokemonName: string;
  categoryId: number | null;
  categoryName: string | null;
  rarity: string;
  condition: string;
  forSale: boolean;
  estimatedValue: string | number | null;
}
export interface PortfolioWish {
  id: number;
  setName: string | null;
  setCode: string | null;
  lastSeenPrice: string | number | null;
}
export interface PortfolioMembership {
  cardId: number;
  binderId: number;
  binderName: string;
}

function priceCents(value: string | number | null): number | null {
  if (value === null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : null;
}
function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function sumPrices(values: Array<string | number | null>) {
  return values.reduce<number>((total, value) => total + (priceCents(value) ?? 0), 0) / 100;
}

/** One row is one physical owned card; metadata and memberships never multiply the owned total. */
export function buildPortfolioBreakdowns(
  cards: PortfolioCard[],
  wishlist: PortfolioWish[],
  memberships: PortfolioMembership[],
  metadata: PortfolioMetadataResult,
): Result {
  const ownedValue = sumPrices(cards.map((card) => card.estimatedValue));
  const wishlistValue = sumPrices(wishlist.map((item) => item.lastSeenPrice));
  const dimensions: Dimension[] = [];
  const makeDimension = (key: Dimension["key"], label: string, scope: Dimension["scope"], note: string) => {
    const source = scope === "wishlist" ? wishlist.map((item) => item.lastSeenPrice) : cards.map((card) => card.estimatedValue);
    const dimension: Dimension = {
      key, label, scope, note, groups: [],
      totalValue: scope === "wishlist" ? wishlistValue : ownedValue,
      cardCount: source.length,
      unvaluedCount: source.filter((value) => priceCents(value) === null).length,
    };
    const groups = new Map<string, Group & { cents: number }>();
    dimensions.push(dimension);
    return {
      add(groupKey: string, groupLabel: string, value: string | number | null) {
        let group = groups.get(groupKey);
        if (!group) {
          group = { key: groupKey, label: groupLabel, totalValue: 0, cardCount: 0, unvaluedCount: 0, cents: 0 };
          groups.set(groupKey, group);
        }
        const cents = priceCents(value);
        group.cardCount++;
        if (cents === null) group.unvaluedCount++;
        group.cents += cents ?? 0;
        group.totalValue = group.cents / 100;
      },
      finish() {
        dimension.groups = [...groups.values()]
          .sort((a, b) => b.totalValue - a.totalValue || a.label.localeCompare(b.label))
          .map(({ cents: _cents, ...group }) => group);
      },
    };
  };
  const membershipMap = new Map<number, Map<number, string>>();
  for (const member of memberships) {
    const binders = membershipMap.get(member.cardId) ?? new Map<number, string>();
    binders.set(member.binderId, member.binderName);
    membershipMap.set(member.cardId, binders);
  }
  const overlapping = cards.some((card) => (membershipMap.get(card.id)?.size ?? 0) > 1);
  const metadataNote = metadata.pending
    ? "Catalog details are still loading. Unavailable includes details not yet resolved."
    : metadata.unavailable
      ? "Some catalog details could not be loaded. Unavailable cards remain included in the total."
      : "Cards without matching catalog details are shown as Unavailable.";
  const category = makeDimension("category", "Category", "owned", "Saved estimated values grouped by your collection categories.");
  const set = makeDimension("set", "Set", "owned", "Saved estimated values grouped by expansion.");
  const year = makeDimension("year", "Year", "owned", `Set release year, not acquisition year. ${metadataNote}`);
  const cardType = makeDimension("card_type", "Card type", "owned", `Catalog card types: Pokémon, Trainer, and Energy. ${metadataNote}`);
  const binder = makeDimension("binder", "Binder", "owned", overlapping
    ? "Cards in multiple binders appear once in each binder, so binder values overlap. The portfolio total counts each owned card once."
    : "Each physical card is counted once per binder. Cards with no placement are shown as Not in a binder.");
  const sale = makeDimension("sale_status", "For sale", "owned", "Saved estimated values, not asking prices. Uses the card's for-sale flag, not marketplace listing status.");
  const wish = makeDimension("wishlist", "Wishlist", "wishlist", "Last-seen price estimates grouped by set. Wishlist items are not owned and are excluded from your portfolio total.");
  const rarity = makeDimension("rarity", "Rarity", "owned", "Saved estimated values grouped by the card's saved rarity.");
  const condition = makeDimension("condition", "Condition", "owned", "Saved estimated values grouped by the card's saved condition.");
  const pokemon = makeDimension("pokemon", "Pokémon / subject", "owned", "Grouped by the saved Pokémon name or card subject.");
  for (const card of cards) {
    const value = card.estimatedValue;
    category.add(card.categoryId === null ? "uncategorized" : String(card.categoryId), card.categoryName || "Uncategorized", value);
    set.add(card.setId || card.setName?.trim().toLowerCase() || "unknown", card.setName || card.setId || "Unspecified set", value);
    const releaseYear = metadata.years.get(card.setId || card.setName || "");
    year.add(releaseYear || "unknown", releaseYear || "Unavailable", value);
    const foundType = metadata.types.get(card.catalogCardId || "");
    const type = foundType && foundType !== "Unknown" ? foundType : undefined;
    cardType.add(type || "unknown", type || "Unavailable", value);
    const placements = membershipMap.get(card.id);
    if (placements?.size) for (const [id, name] of placements) binder.add(String(id), name, value);
    else binder.add("unplaced", "Not in a binder", value);
    sale.add(card.forSale ? "for_sale" : "not_for_sale", card.forSale ? "For sale" : "Not for sale", value);
    rarity.add(card.rarity || "unknown", humanize(card.rarity || "Unspecified"), value);
    condition.add(card.condition || "unknown", humanize(card.condition || "Unspecified"), value);
    pokemon.add(card.pokemonName?.trim().toLowerCase() || "unknown", card.pokemonName || "Unspecified subject", value);
  }
  for (const item of wishlist) wish.add(item.setCode || item.setName?.trim().toLowerCase() || "unknown", item.setName || item.setCode || "Unspecified set", item.lastSeenPrice);
  for (const dimension of [category, set, year, cardType, binder, sale, wish, rarity, condition, pokemon]) dimension.finish();
  return { ownedValue, ownedCount: cards.length, wishlistValue, wishlistCount: wishlist.length, metadataPending: metadata.pending, dimensions };
}