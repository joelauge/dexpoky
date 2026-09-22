import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { and } from "drizzle-orm";
import { buildOwnedCardConditions } from "./cards.js";
import { deterministicCatalogRank } from "./catalog.js";
import type { NormalizedCatalogCard } from "../lib/pokewallet.js";

function card(id: string, name: string, setCode: string, cardNumber: string): NormalizedCatalogCard {
  return {
    id, name, pokemonName: name, setName: "Set", setCode, cardNumber,
    rarity: null, imageUrl: "", marketPrice: null, tcgplayerUrl: null, cardmarketUrl: null,
  };
}

describe("lookup correctness", () => {
  it("always scopes owned-card search to the authenticated owner while retaining filters", () => {
    const dialect = new PgDialect();
    const query = dialect.sqlToQuery(and(...buildOwnedCardConditions("owner-a", {
      search: "Charizard", rarity: "rare", forSale: true, categoryId: 7,
    }))!);
    expect(query.sql).toContain('"cards"."owner_clerk_id" = $1');
    expect(query.params).toContain("owner-a");
    expect(query.params).toContain("Charizard");
    expect(query.params).toContain("rare");
    expect(query.params).not.toContain("owner-b");
  });

  it("keeps an exact set-card identity ahead of name matches", () => {
    const results = deterministicCatalogRank([
      card("other", "Base One Collector", "xy1", "4"),
      card("exact", "Charizard", "base1", "4"),
      card("name", "base1 4", "other", "9"),
    ], "base1-4");
    expect(results.map(({ id }) => id)).toEqual(["exact", "other", "name"]);
  });
});