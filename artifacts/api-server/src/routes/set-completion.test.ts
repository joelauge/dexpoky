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