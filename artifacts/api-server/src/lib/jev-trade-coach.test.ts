import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deterministicTradeFacts,
  evaluateTrade,
  type TradeCoachEvidence,
} from "./jev-trade-coach.js";

const baseEvidence: TradeCoachEvidence = {
  offerId: 1,
  status: "countered",
  listedCard: {
    name: "Charizard",
    catalogCardId: "base-4",
    condition: "near_mint",
    exactValue: 100,
  },
  proposal: {
    from: "buyer",
    cash: 25,
    cards: [{
      name: "Blastoise",
      catalogCardId: "base-2",
      condition: "near_mint",
      exactValue: 75,
    }],
  },
  personalSignals: {
    listedCardMatchesBuyerWant: true,
    proposalMatchesRecipientWishlist: ["high"],
  },
  traderHistory: {
    buyer: { ratingCount: 8, average: 4.8 },
    seller: { ratingCount: 12, average: 4.7 },
  },
};

function response(score = 2, confidence = .9) {
  return {
    model: "test-model",
    answers: Object.fromEntries(
      ["marketBalance", "personalValue", "conditionRisk", "confidence"].map((id) => [
        id,
        {
          type: "score",
          score,
          confidence,
          probabilities: { "0": .02, "1": .08, "2": .9 },
        },
      ]),
    ),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("trade coach", () => {
  it("keeps balanced exact totals separate from judgments", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response()), { status: 200 }),
    ));

    const result = await evaluateTrade(baseEvidence);

    expect(result.facts).toMatchObject({
      proposalFrom: "buyer",
      sellerSideValue: 100,
      buyerSideValue: 100,
      proposalCardValue: 75,
      proposalCash: 25,
      difference: 0,
    });
    expect(result.judgments.marketBalance.label).toBe("Values look close");
    expect(result.disclaimer).toContain("not a guarantee");
  });

  it("uses wishlist evidence for a personal-value judgment", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response()), { status: 200 }),
    ));

    const result = await evaluateTrade(baseEvidence);

    expect(result.judgments.personalValue.label).toBe("Strong personal fit");
  });

  it("calls out missing condition even if the model is confident", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response()), { status: 200 }),
    ));

    const result = await evaluateTrade({
      ...baseEvidence,
      proposal: {
        ...baseEvidence.proposal,
        cards: [{ ...baseEvidence.proposal.cards[0], condition: null }],
      },
    });

    expect(result.judgments.conditionRisk.label).toBe("Condition missing");
  });

  it("does not invent a total when an exact card value is missing", () => {
    const facts = deterministicTradeFacts({
      ...baseEvidence,
      proposal: {
        ...baseEvidence.proposal,
        cards: [{ ...baseEvidence.proposal.cards[0], exactValue: null }],
      },
    });

    expect(facts.proposalCardValue).toBeNull();
    expect(facts.buyerSideValue).toBeNull();
    expect(facts.difference).toBeNull();
    expect(facts.missingValues[0]).toContain("Blastoise");
  });

  it("rejects adversarial out-of-range output and falls back safely", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response(99, 1)), { status: 200 }),
    ));

    const result = await evaluateTrade(baseEvidence);

    expect(result.unavailable).toBe(true);
    expect(result.judgments.confidence.label).toBe("Coach unavailable");
    expect(result.facts.buyerSideValue).toBe(100);
  });

  it("puts seller-authored counter cards on the seller side", () => {
    const facts = deterministicTradeFacts({
      ...baseEvidence,
      proposal: {
        from: "seller",
        cash: 110,
        cards: [{ ...baseEvidence.proposal.cards[0], exactValue: 20 }],
      },
    });

    expect(facts.sellerSideValue).toBe(120);
    expect(facts.buyerSideValue).toBe(110);
    expect(facts.proposalFrom).toBe("seller");
    expect(facts.difference).toBe(-10);
  });

  it("does not let a confident model hide a large exact value gap", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response(2, .99)), { status: 200 }),
    ));
    const result = await evaluateTrade({
      ...baseEvidence,
      proposal: {
        from: "buyer",
        cash: 5,
        cards: [],
      },
    });

    expect(result.facts.difference).toBe(-95);
    expect(result.judgments.marketBalance.label).toBe("Large value gap");
  });

  it("caps coach confidence when valid model output contradicts missing evidence", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response(2, .99)), { status: 200 }),
    ));
    const result = await evaluateTrade({
      ...baseEvidence,
      proposal: {
        ...baseEvidence.proposal,
        cards: [{ ...baseEvidence.proposal.cards[0], exactValue: null }],
      },
    });

    expect(result.judgments.confidence.label).toBe("Low confidence");
    expect(result.judgments.confidence.score).toBeLessThanOrEqual(.33);
    expect(result.judgments.confidence.confidence).toBeLessThanOrEqual(.5);
  });

  it("warns about missing condition even when the coach is unavailable", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    const result = await evaluateTrade({
      ...baseEvidence,
      listedCard: { ...baseEvidence.listedCard!, condition: null },
    });

    expect(result.unavailable).toBe(true);
    expect(result.facts.missingValues.some((message) => message.includes("confirmed condition"))).toBe(true);
    expect(result.judgments.conditionRisk.label).toBe("Missing evidence");
  });
});