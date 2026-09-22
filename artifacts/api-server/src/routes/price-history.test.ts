import { describe, expect, it } from "vitest";
import { buildRepriceAction, buildTcgdexId, classifyReprice } from "./price-history.js";

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