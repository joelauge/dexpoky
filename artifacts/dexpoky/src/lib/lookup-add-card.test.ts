import assert from "node:assert/strict";
import { test } from "node:test";
import type { CatalogCard, PriceLookup } from "@workspace/api-client-react";
import { lookupCardInput, lookupRarity } from "./lookup-add-card";

test("lookup creation preserves exact identity, verified set, displayed art and chosen collection without picking a price", () => {
  const lookup = { card: { id: "exact", name: "Frosmoth", setName: "Ascended Heroes", cardNumber: "053/217", imageUrl: "https://example.com/other.webp" } } as PriceLookup;
  const body = lookupCardInput({
    lookup, catalog: { id: "wrong", pokemonName: "Wrong Pokémon" } as CatalogCard,
    set: { id: "verified-set", name: "Ascended Heroes" }, imageUrl: "https://example.com/displayed.webp",
    rarity: "rare", condition: "near_mint", collectionId: 42,
  });
  assert.equal(body.catalogCardId, "exact");
  assert.equal(body.pokemonName, "Frosmoth");
  assert.equal(body.setId, "verified-set");
  assert.equal(body.cardNumber, "053/217");
  assert.equal(body.collectionId, 42);
  assert.equal(body.imageUrl, "https://example.com/displayed.webp");
  assert.equal(body.estimatedValue, undefined);
  assert.equal(body.forSale, false);
  assert.equal(lookupCardInput({ lookup, imageUrl: null, rarity: "common", condition: "mint", collectionId: null }).setId, null);
});
test("unknown rarity is confirmed by the collector rather than invented", () => {
  assert.equal(lookupRarity(null), null);
  assert.equal(lookupRarity("unknown"), null);
  assert.equal(lookupRarity("Uncommon"), "uncommon");
  assert.equal(lookupRarity("Double Rare"), "rare");
  assert.equal(lookupRarity("Special Illustration Rare"), "secret_rare");
});
