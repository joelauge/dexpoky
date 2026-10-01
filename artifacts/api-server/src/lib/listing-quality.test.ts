import { afterEach, describe, expect, it, vi } from "vitest";
import { listingHardIssues, reviewListingQuality, type ListingCardEvidence, type ListingDraftEvidence } from "./listing-quality.js";

const card: ListingCardEvidence = {
  id: 1,
  name: "Charizard ex",
  pokemonName: "Charizard",
  setName: "Example Set",
  setId: "sv1",
  cardNumber: "125",
  catalogCardId: "sv1-125",
  condition: "near_mint",
  estimatedValue: 50,
  originalScanUrl: "/api/storage/card-front",
};

const sale: ListingDraftEvidence = {
  listingType: "buy_now",
  price: 55,
  description: "Near mint card with clean edges and no visible scratches.",
  listingImages: ["/front", "/back"],
  startingBid: null,
  reservePrice: null,
  buyNowPrice: null,
  minBidIncrement: null,
  auctionEndTime: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("listingHardIssues", () => {
  it("allows a valid fixed-price draft", () => {
    expect(listingHardIssues(card, sale, false)).toEqual([]);
  });

  it("blocks contradictory mint claims", () => {
    expect(listingHardIssues(
      { ...card, condition: "played" },
      { ...sale, description: "Perfect mint condition." },
      false,
    )).toContain("The description claims mint condition, but the saved condition is played.");
  });

  it.each(["PSA 10", "BGS 9.5", "CGC 9", "TAG 10"])(
    "blocks unsupported %s grading claims",
    (companyGrade) => {
      expect(listingHardIssues(card, { ...sale, description: `${companyGrade} graded card.` }, false))
        .toContain("Remove the grading/certification claim or verify the grading certificate first.");
    },
  );

  it("blocks inconsistent auction terms", () => {
    const issues = listingHardIssues(card, {
      ...sale,
      listingType: "auction",
      price: 20,
      startingBid: 20,
      reservePrice: 10,
      buyNowPrice: 15,
      minBidIncrement: 0,
      auctionEndTime: "2020-01-01T00:00:00.000Z",
    }, false, new Date("2026-01-01").getTime());
    expect(issues).toHaveLength(4);
  });
});

describe("reviewListingQuality", () => {
  it("falls back without blocking when Jev is unavailable", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const review = await reviewListingQuality(card, sale, false);
    expect(review.unavailable).toBe(true);
    expect(review.canPublish).toBe(true);
    expect(review.dimensions.completeness.label).toBe("Unclear");
    expect(review.disclaimer).toContain("does not authenticate");
  });
});