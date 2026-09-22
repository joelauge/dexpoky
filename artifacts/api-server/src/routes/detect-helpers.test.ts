import { describe, expect, it } from "vitest";
import { buildDirectIdentityCandidates, normalizeSetCode, rankTcgResults, type TcgResult } from "./detect-helpers.js";

function card(
  id: string,
  setId: string,
  cardNumber: string,
  name = "Pikachu",
): TcgResult {
  return {
    id,
    name,
    imageUrl: "",
    setName: setId,
    setId,
    cardNumber,
    rarity: null,
  };
}

describe("card detection result ranking", () => {
  it("builds padded and unpadded strict set identity candidates", () => {
    expect(buildDirectIdentityCandidates("MEE EN", "005")).toEqual(["mee-005", "mee-5"]);
    expect(buildDirectIdentityCandidates("SV-01", "5")).toEqual(["sv1-5"]);
    expect(buildDirectIdentityCandidates("ME", "005/190")).toEqual(["me-005", "me-5"]);
    expect(buildDirectIdentityCandidates("MEE", "XY5")).toEqual([]);
  });

  it("normalizes set codes without conflating textual prefixes", () => {
    expect(normalizeSetCode("SV-01 EN")).toBe("sv1");
    expect(normalizeSetCode("MEE")).toBe("mee");
    expect(normalizeSetCode("SVX1")).toBe("svx1");
  });
  it("puts the matching set and number ahead of the same number in other sets", () => {
    const results = rankTcgResults(
      [
        card("other-025", "base", "025"),
        card("target-025", "sv1", "025"),
      ],
      "Pikachu",
      "025",
      "SV1",
    );

    expect(results.map((result) => result.id)).toEqual([
      "target-025",
      "other-025",
    ]);
  });

  it("retains broad alternate printings instead of filtering them out", () => {
    const results = rankTcgResults(
      [
        card("sv1-025", "sv1", "025"),
        card("sv1-026", "sv1", "026"),
        card("base-025", "base", "025"),
      ],
      "Pikachu",
      "025",
      "SV1",
    );

    expect(results).toHaveLength(3);
    expect(results.map((result) => result.id)).toEqual([
      "sv1-025",
      "sv1-026",
      "base-025",
    ]);
  });

  it("uses number plus name when the set code is unavailable", () => {
    const results = rankTcgResults(
      [
        card("base-025", "base", "025"),
        card("sv1-025", "sv1", "025"),
        card("sv1-026", "sv1", "026"),
      ],
      "Pikachu",
      "025",
    );

    expect(results[0]?.id).toBe("base-025");
    expect(results).toHaveLength(3);
  });

  it("normalizes set-code punctuation and numeric padding without textual false matches", () => {
    const results = rankTcgResults(
      [
        card("similar-text", "svx1", "025"),
        card("target", "SV-01", "025"),
      ],
      "Pikachu",
      "025",
      "sv1",
    );

    expect(results[0]?.id).toBe("target");
    expect(results.map((result) => result.id)).toContain("similar-text");
  });

  it("deduplicates candidates by catalog ID", () => {
    const results = rankTcgResults(
      [
        card("sv1-025", "sv1", "025"),
        card("sv1-025", "SV01", "025"),
        card("sv1-026", "sv1", "026"),
      ],
      "Pikachu",
      "025",
      "SV1",
    );

    expect(results.map((result) => result.id)).toEqual(["sv1-025", "sv1-026"]);
  });
});