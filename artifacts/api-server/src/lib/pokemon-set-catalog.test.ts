import { describe, expect, it } from "vitest";
import {
  mergeTcgcsvSetCards,
  sourceOnlyTcgcsvGroup,
  tcgcsvGroupMatchesSet,
  type PokemonSetForMerge,
  type TcgcsvSetCard,
} from "./pokemon-set-catalog.js";

const set: PokemonSetForMerge = {
  id: "sv09",
  name: "Journey Together",
  cards: [
    { id: "sv09-008", localId: "008", name: "Pikachu", imageUrl: "https://tcgdex.test/pikachu.png" },
  ],
};

function catalogCard(id: string, cardNumber: string, name: string, imageUrl = "https://tcgcsv.test/card.jpg"): TcgcsvSetCard {
  return {
    id,
    cardNumber,
    name,
    setName: "Journey Together",
    setId: "sv09",
    imageUrl,
    rarity: "Common",
  };
}

describe("Pokemon set provider merging", () => {
  it("matches only strict full set names or exact printed codes", () => {
    expect(tcgcsvGroupMatchesSet({
      groupId: 1, categoryId: 3, name: "JT: Journey Together", abbreviation: "JT",
    }, set)).toBe(true);
    expect(tcgcsvGroupMatchesSet({
      groupId: 2, categoryId: 3, name: "SV09: Unrelated Set", abbreviation: "SV09",
    }, set)).toBe(true);
    expect(tcgcsvGroupMatchesSet({
      groupId: 3, categoryId: 3, name: "Journey Together Special Collection", abbreviation: "JTS",
    }, set)).toBe(false);
    expect(tcgcsvGroupMatchesSet({
      groupId: 4, categoryId: 3, name: "Other Set", abbreviation: "SV08",
    }, set)).toBe(false);
    expect(tcgcsvGroupMatchesSet({
      groupId: 5, categoryId: 3, name: "SV09: Journey Together (JP Exclusive)", abbreviation: "SV09",
    }, set)).toBe(false);
  });

  it("adds exact duplicate aliases without changing the canonical TCGdex card", () => {
    const merged = mergeTcgcsvSetCards(set, [
      catalogCard("tcgcsv_20_100", "8", "Pikachu - 008"),
      catalogCard("tcgcsv_20_101", "008", "Pikachu - 008"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      id: "sv09-008",
      localId: "008",
      name: "Pikachu",
      imageUrl: "https://tcgdex.test/pikachu.png",
      catalogIds: ["sv09-008", "tcgcsv_20_100", "tcgcsv_20_101"],
    });
  });

  it("treats a TCGCSV numerator/denominator as the same printed collector number", () => {
    const orderSet: PokemonSetForMerge = {
      id: "me03",
      name: "Perfect Order",
      cards: [{ id: "me03-001", localId: "001", name: "Spinarak" }],
    };
    const merged = mergeTcgcsvSetCards(orderSet, [
      catalogCard("tcgcsv_24587_684397", "001/088", "Spinarak"),
      catalogCard("tcgcsv_24587_684398", "081/088", "Poke Pad - 081/088"),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({
      id: "me03-001",
      catalogIds: ["me03-001", "tcgcsv_24587_684397"],
    });
    expect(merged[1]).toMatchObject({
      id: "tcgcsv_24587_684398",
      localId: "081/088",
    });
  });

  it("does not merge a different name, collector number, or set into TCGdex identity", () => {
    const merged = mergeTcgcsvSetCards(set, [
      catalogCard("tcgcsv_20_200", "008", "Raichu - 008"),
      catalogCard("tcgcsv_20_201", "016", "Pikachu - 016"),
    ]);
    expect(merged.map((card) => card.id)).toEqual([
      "sv09-008",
      "tcgcsv_20_200",
      "tcgcsv_20_201",
    ]);
    expect(merged[1]?.imageUrl).toBe("https://tcgcsv.test/card.jpg");
    expect(merged[2]?.localId).toBe("016");
  });

  it("keeps separately numbered MEE anniversary energies as 16 distinct cards", () => {
    const kinds = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal"];
    const cards = kinds.flatMap((kind, index) => [
      catalogCard(`tcgcsv_24461_${100 + index}`, String(index + 1), `Basic ${kind} Energy - ${String(index + 1).padStart(3, "0")}`),
      catalogCard(`tcgcsv_24461_${200 + index}`, String(index + 9).padStart(3, "0"), `Basic ${kind} Energy - ${String(index + 9).padStart(3, "0")} (30th Celebration)`),
    ]);
    const merged = mergeTcgcsvSetCards({ id: "tcgcsv_24461", name: "MEE: Mega Evolution Energies", cards: [] }, cards);
    expect(merged).toHaveLength(16);
    expect(merged.map((card) => card.localId)).toEqual([
      "1", "009", "2", "010", "3", "011", "4", "012", "5", "013", "6", "014", "7", "015", "8", "016",
    ]);
    expect(merged.every((card) => card.id.startsWith("tcgcsv_24461_"))).toBe(true);

    const dexCards = kinds.map((kind, index) => ({
      id: `mee-${String(index + 1).padStart(3, "0")}`,
      localId: String(index + 1).padStart(3, "0"),
      name: `${kind} Energy`,
    }));
    const matched = mergeTcgcsvSetCards(
      { id: "mee", name: "Mega Evolution Energy", cards: dexCards },
      cards,
    );
    expect(matched).toHaveLength(16);
    expect(matched[0]).toMatchObject({
      id: "mee-001",
      name: "Grass Energy",
      catalogIds: ["mee-001", "tcgcsv_24461_100"],
    });
  });

  it("permits only the verified English MEE source-only group", () => {
    expect(sourceOnlyTcgcsvGroup({
      groupId: 24461, categoryId: 3, name: "MEE: Mega Evolution Energies", abbreviation: "MEE",
    })).toBe(true);
    expect(sourceOnlyTcgcsvGroup({
      groupId: 12, categoryId: 3, name: "MEE: Mega Evolution Energies", abbreviation: "MEE",
    })).toBe(false);
    expect(sourceOnlyTcgcsvGroup({
      groupId: 24461, categoryId: 3, name: "Mega Evolution Energies (JP)", abbreviation: "MEE",
    })).toBe(false);
  });
});