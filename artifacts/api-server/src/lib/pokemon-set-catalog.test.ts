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

  it("collapses only known finish and stamp product qualifiers while retaining meaningful parentheses", () => {
    const qualifierSet: PokemonSetForMerge = {
      id: "me02.5",
      name: "Ascended Heroes",
      cards: [
        { id: "me02.5-101", localId: "101", name: "Dugtrio" },
        { id: "me02.5-102", localId: "102", name: "Meowth (Rocket's Hideout)" },
      ],
    };
    const merged = mergeTcgcsvSetCards(qualifierSet, [
      catalogCard("tcgcsv_24541_1", "101", "Dugtrio (Holofoil) - 101"),
      catalogCard("tcgcsv_24541_2", "101", "Dugtrio - 101 (Stamped)"),
      catalogCard("tcgcsv_24541_3", "102", "Meowth (Rocket's Hideout) - 102"),
    ]);

    expect(merged).toHaveLength(2);
    expect(merged.find((card) => card.id === "me02.5-101")?.catalogIds).toEqual([
      "me02.5-101",
      "tcgcsv_24541_1",
      "tcgcsv_24541_2",
    ]);
    expect(merged.find((card) => card.id === "me02.5-102")?.catalogIds).toEqual([
      "me02.5-102",
      "tcgcsv_24541_3",
    ]);
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

  it("attaches Ascended Heroes stamped Dugtrio printings to the existing numbered card", () => {
    const ascended: PokemonSetForMerge = {
      id: "me02.5",
      name: "Ascended Heroes",
      cards: [{ id: "me02.5-101", localId: "101", name: "Team Rocket's Dugtrio" }],
    };
    const merged = mergeTcgcsvSetCards(ascended, [
      catalogCard("tcgcsv_24541_676933", "101/217", "Team Rocket's Dugtrio - 101/217 (Team Rocket)"),
      catalogCard("tcgcsv_24541_677073", "101/217", "Team Rocket's Dugtrio - 101/217 (Master Ball)"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.catalogIds).toEqual([
      "me02.5-101",
      "tcgcsv_24541_676933",
      "tcgcsv_24541_677073",
    ]);
  });

  it("does not inflate a core checklist or invent aliases for conflicting same-number products", () => {
    const native: PokemonSetForMerge = {
      id: "me02.5",
      name: "Ascended Heroes",
      cards: [{ id: "me02.5-101", localId: "101", name: "Team Rocket's Dugtrio" }],
    };
    const merged = mergeTcgcsvSetCards(native, [
      catalogCard("tcgcsv_24541_999", "101/217", "Unverified alternative name - 101/217"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.catalogIds).toEqual(["me02.5-101"]);
  });

  it("rejects a conflicting same-number name and keeps a genuinely different collector number separate", () => {
    const merged = mergeTcgcsvSetCards(set, [
      catalogCard("tcgcsv_20_200", "008", "Raichu - 008"),
      catalogCard("tcgcsv_20_201", "016", "Pikachu - 016"),
    ]);
    expect(merged.map((card) => card.id)).toEqual([
      "sv09-008",
      "tcgcsv_20_201",
    ]);
    expect(merged[1]?.imageUrl).toBe("https://tcgcsv.test/card.jpg");
    expect(merged[1]?.localId).toBe("016");
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