import { describe, expect, it } from "vitest";
import { getSetCompletion } from "../../../dexpoky/src/lib/set-completion.js";

const set = {
  id: "sv3pt5",
  name: "Scarlet & Violet—151",
  totalCards: 3,
  cards: [
    { id: "sv3pt5-001", localId: "001", name: "Bulbasaur" },
    { id: "sv3pt5-002", localId: "002", name: "Ivysaur" },
    { id: "sv3pt5-TG03", localId: "TG03", name: "Venusaur" },
  ],
};

describe("set completion", () => {
  it("matches exact catalog card IDs and ignores unknown IDs", () => {
    const completion = getSetCompletion(set, [
      { id: 10, catalogCardId: "sv3pt5-001" },
      { id: 11, catalogCardId: "sv3pt5-999" },
      { id: 12, catalogCardId: "other-002" },
    ]);

    expect([...completion.ownedCardKeys]).toEqual(["sv3pt5-001"]);
    expect(completion.firstOwnedCardIdMap.get("sv3pt5-001")).toBe(10);
    expect(completion.ownedCount).toBe(1);
  });

  it("falls back to normalized set names and card numbers", () => {
    const completion = getSetCompletion(set, [
      {
        id: 20,
        setName: "SCARLET & VIOLET 151",
        cardNumber: "TG-03",
      },
      {
        id: 21,
        setName: " Scarlet & Violet—151 ",
        cardNumber: "002",
      },
    ]);

    expect(completion.ownedCardKeys).toEqual(
      new Set(["sv3pt5-TG03", "sv3pt5-002"]),
    );
  });

  it("counts duplicate physical copies once and keeps the first copy link", () => {
    const completion = getSetCompletion(set, [
      { id: 30, catalogCardId: "sv3pt5-001" },
      {
        id: 31,
        setName: "Scarlet Violet 151",
        cardNumber: "001",
      },
      { id: 32, catalogCardId: "sv3pt5-001" },
    ]);

    expect(completion.ownedCount).toBe(1);
    expect(completion.firstOwnedCardIdMap.get("sv3pt5-001")).toBe(30);
  });

  it("maps exact TCGCSV and TCGDEX catalog aliases to one canonical card", () => {
    const aliasedSet = {
      ...set,
      cards: [
        {
          ...set.cards[0],
          catalogIds: ["tcgcsv_300_1", "tcgdex_sv3pt5-001"],
        },
        ...set.cards.slice(1),
      ],
    };
    const completion = getSetCompletion(aliasedSet, [
      { id: 35, catalogCardId: "tcgcsv_300_1" },
      { id: 36, catalogCardId: "tcgdex_sv3pt5-001" },
    ]);

    expect([...completion.ownedCardKeys]).toEqual(["sv3pt5-001"]);
    expect(completion.ownedCount).toBe(1);
    expect(completion.totalPhysicalCount).toBe(2);
    expect(completion.firstOwnedCardIdMap.get("sv3pt5-001")).toBe(35);
  });

  it("matches source-only CSV set IDs and exact catalog card IDs from a set summary", () => {
    const summary = {
      id: "sv09",
      name: "Journey Together",
      totalCards: 1,
      catalogSetIds: ["tcgcsv_300"],
      cards: [
        {
          id: "tcgcsv_300_1",
          localId: "001",
          name: "Pokemon",
        },
      ],
    };
    const completion = getSetCompletion(summary, [
      { id: 37, catalogCardId: "tcgcsv_300_1" },
    ]);

    expect([...completion.ownedCardKeys]).toEqual(["tcgcsv_300_1"]);
    expect(completion.ownedCount).toBe(1);
  });

  it("normalizes numerator card numbers before matching local IDs", () => {
    const paddedNumberMatch = getSetCompletion(
      {
        id: "numbered",
        name: "Numbered Set",
        totalCards: 1,
        cards: [{ id: "numbered-4", localId: "004", name: "Four" }],
      },
      [{ id: 38, setName: "Numbered Set", cardNumber: "4/088" }],
    );
    const numeratorMatch = getSetCompletion(
      {
        id: "numbered",
        name: "Numbered Set",
        totalCards: 1,
        cards: [{ id: "numbered-4", localId: "0004", name: "Four" }],
      },
      [{ id: 39, setName: "Numbered Set", cardNumber: "004/088" }],
    );

    expect([...paddedNumberMatch.ownedCardKeys]).toEqual(["numbered-4"]);
    expect([...numeratorMatch.ownedCardKeys]).toEqual(["numbered-4"]);
  });

  it("does not fall back to matching set name and number for another explicit catalog group", () => {
    const completion = getSetCompletion(set, [
      {
        id: 40,
        catalogCardId: "other-001",
        setName: set.name,
        cardNumber: "001",
      },
    ]);

    expect(completion.ownedCardKeys.size).toBe(0);
    expect(completion.ownedCount).toBe(0);
  });

  it("counts merged set-index aliases once by printed card number", () => {
    const completion = getSetCompletion(
      {
        id: "merged-set",
        name: "Merged Set",
        totalCards: 10,
        catalogSetIds: ["tcgcsv_300", "tcgcsv_301"],
      },
      [
        {
          id: 41,
          catalogCardId: "tcgcsv_300_1",
          cardNumber: "004/088",
        },
        {
          id: 42,
          catalogCardId: "tcgcsv_301_1",
          cardNumber: "4/088",
        },
      ],
    );

    expect([...completion.ownedCardKeys]).toEqual(["4"]);
    expect(completion.ownedCount).toBe(1);
    expect(completion.totalPhysicalCount).toBe(2);
  });

  it("keeps owned, missing, search, and completion totals consistent", () => {
    const completion = getSetCompletion(set, [
      { id: 40, catalogCardId: "sv3pt5-001" },
      {
        id: 41,
        setName: "scarlet violet 151",
        cardNumber: "TG 03",
      },
    ]);
    const searchResults = set.cards.filter(
      (card) =>
        card.name.toLowerCase().includes("saur") ||
        card.localId.toLowerCase().includes("saur"),
    );
    const ownedSearchResults = searchResults.filter((card) =>
      completion.ownedCardKeys.has(card.id),
    );
    const missingSearchResults = searchResults.filter(
      (card) => !completion.ownedCardKeys.has(card.id),
    );

    expect(completion.totalCount).toBe(3);
    expect(completion.ownedCount).toBe(2);
    expect(completion.missingCount).toBe(1);
    expect(completion.ownedCount + completion.missingCount).toBe(
      completion.totalCount,
    );
    expect(completion.completionPercent).toBe(67);
    expect(ownedSearchResults.length + missingSearchResults.length).toBe(
      searchResults.length,
    );
  });
});