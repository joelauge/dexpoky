import { describe, expect, it } from "vitest";
import { deterministicGates, evaluateCardConfidence, type CardConfidenceInput } from "./card-confidence.js";

function evidence(overrides: Partial<CardConfidenceInput> = {}): CardConfidenceInput {
  return {
    observed: { ocrName: "Deoxys", ocrSetCode: "me04", ocrCardNumber: "031/086" },
    candidate: { id: "me04-031", name: "Deoxys", setId: "me04", cardNumber: "031" },
    pricing: { marketPrice: 12.34, source: "tcgplayer", evidenceAt: new Date().toISOString() },
    condition: { value: "near_mint", source: "scan_review" },
    ...overrides,
  };
}

describe("card confidence deterministic gates", () => {
  it("accepts an exact card number when the observed number includes a denominator", () => {
    const result = deterministicGates(evidence());

    expect(result.dimensions.printingIdentity.status).toBe("safe");
    expect(result.dimensions.priceEvidence.status).toBe("safe");
    expect(result.dimensions.listingReadiness.status).toBe("needs_review");
  });

  it("blocks a catalog printing mismatch even when price and condition exist", () => {
    const result = deterministicGates(evidence({
      candidate: { id: "me04-032", name: "Deoxys", setId: "me04", cardNumber: "032" },
    }));

    expect(result.dimensions.printingIdentity.status).toBe("blocked");
    expect(result.dimensions.listingReadiness.status).toBe("blocked");
  });

  it("blocks missing exact-printing price evidence", () => {
    const result = deterministicGates(evidence({ pricing: null }));

    expect(result.dimensions.priceEvidence.status).toBe("blocked");
    expect(result.dimensions.listingReadiness.status).toBe("blocked");
  });

  it("does not treat null prices as numeric zero", () => {
    const result = deterministicGates(evidence({
      pricing: { marketPrice: null, lowPrice: null, source: "tcgplayer" },
    }));

    expect(result.dimensions.priceEvidence.status).toBe("blocked");
    expect(result.dimensions.listingReadiness.status).toBe("blocked");
  });

  it("blocks fallback pricing that is not tied to the exact printing", () => {
    const result = deterministicGates(evidence({
      pricing: { marketPrice: 57.65, source: "tcgplayer", isFallback: true },
    }));

    expect(result.dimensions.priceEvidence.status).toBe("blocked");
    expect(result.dimensions.listingReadiness.status).toBe("blocked");
  });

  it("flags stale exact-printing price evidence for review", () => {
    const result = deterministicGates(evidence({
      pricing: {
        marketPrice: 12.34,
        source: "tcgplayer",
        evidenceAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
    }));

    expect(result.evidenceFresh).toBe(false);
    expect(result.dimensions.priceEvidence.status).toBe("needs_review");
  });

  it("does not mark incomplete identity evidence as a mismatch", () => {
    const result = deterministicGates(evidence({
      observed: { ocrName: "Deoxys", ocrSetCode: null, ocrCardNumber: null },
    }));

    expect(result.dimensions.printingIdentity.status).toBe("unknown");
    expect(result.dimensions.listingReadiness.status).toBe("blocked");
  });

  it("preserves authoritative gates when TypeSafe is unavailable", async () => {
    const previous = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      const result = await evaluateCardConfidence(evidence());

      expect(result.unavailable).toBe(true);
      expect(result.dimensions.printingIdentity.status).toBe("safe");
      expect(result.dimensions.priceEvidence.status).toBe("safe");
      expect(result.dimensions.listingReadiness.status).toBe("needs_review");
    } finally {
      if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = previous;
    }
  });
});