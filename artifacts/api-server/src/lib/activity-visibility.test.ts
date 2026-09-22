import { describe, expect, it } from "vitest";
import { isVisibleActivityType, visibleActivityTypes } from "./activity-visibility.js";

describe("activity visibility", () => {
  it("keeps internal recommendation feedback out of recent activity", () => {
    expect(isVisibleActivityType("recommendation_feedback")).toBe(false);
    expect(visibleActivityTypes).not.toContain("recommendation_feedback");
  });

  it("keeps supported collection and marketplace events visible", () => {
    expect(isVisibleActivityType("card_added")).toBe(true);
    expect(isVisibleActivityType("listing_sold")).toBe(true);
    expect(isVisibleActivityType("wanted_listing_match")).toBe(true);
  });
});