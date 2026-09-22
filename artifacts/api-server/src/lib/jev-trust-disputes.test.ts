import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { evaluateTrust, isTransactionParticipant, triageDispute } from "./jev-trust-disputes.js";

beforeEach(() => vi.stubEnv("TYPESAFE_API_KEY", ""));
afterEach(() => vi.unstubAllEnvs());

describe("trust signals", () => {
  it("marks sparse history as uncertain without defamatory labels", async () => {
    const result = await evaluateTrust({
      ratingCount: 1, completedTransactions: 1, averageScore: 2,
      communicationAverage: 2, conditionAverage: null, shippingAverage: null,
      valueAverage: null, negativeCount: 1, recentNegativeCount: 1,
    });
    expect(result.unavailable).toBe(true);
    expect(result.dimensions.communication.uncertain).toBe(true);
    expect(result.dimensions.listingAccuracy.score).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/fraud|scam/);
  });

  it("shows conflicting feedback through observed dimension scores", async () => {
    const result = await evaluateTrust({
      ratingCount: 8, completedTransactions: 8, averageScore: 3.8,
      communicationAverage: 4.8, conditionAverage: 2.1, shippingAverage: 4.5,
      valueAverage: 2.4, negativeCount: 2, recentNegativeCount: 1,
    });
    expect(result.dimensions.communication.score).toBeGreaterThan(result.dimensions.listingAccuracy.score!);
  });

  it("reduces the transaction-history signal for repeated recent issues", async () => {
    const baseline = await evaluateTrust({
      ratingCount: 10, completedTransactions: 10, averageScore: 4.5,
      communicationAverage: 4.5, conditionAverage: 4.5, shippingAverage: 4.5,
      valueAverage: 4.5, negativeCount: 0, recentNegativeCount: 0,
    });
    const repeated = await evaluateTrust({
      ratingCount: 10, completedTransactions: 10, averageScore: 3.2,
      communicationAverage: 4.5, conditionAverage: 3, shippingAverage: 3,
      valueAverage: 3, negativeCount: 4, recentNegativeCount: 3,
    });
    expect(repeated.dimensions.transactionHistory.score).toBeLessThan(baseline.dimensions.transactionHistory.score!);
    expect(repeated.dimensions.transactionHistory.evidence).toContain("3 negative ratings in the last 90 days");
  });
});

describe("dispute triage", () => {
  const base = {
    declaredCategory: null,
    transaction: { offerId: 8, status: "paid", paymentStatus: "completed", paymentMethod: "card", amountCents: 1000 },
    evidenceProvided: { transactionId: true, paymentReceipt: false, tracking: false, itemPhotos: false, messages: false },
    priorReportsByReporter: 0,
  };

  it("escalates serious reports to humans and requests issue-specific evidence", async () => {
    const result = await triageDispute({ ...base, description: "I was charged twice and need help with the payment." });
    expect(result).toMatchObject({ category: "payment", urgency: "urgent", escalated: true, reviewState: "priority_human_review" });
    expect(result.missingEvidence).toContain("Payment receipt or charge record");
  });

  it("treats model failure as low confidence and never returns an enforcement action", async () => {
    const result = await triageDispute({ ...base, description: "The seller stopped responding." });
    expect(result.unavailable).toBe(true);
    expect(result.escalated).toBe(true);
    expect(result).not.toHaveProperty("refund");
    expect(result).not.toHaveProperty("suspend");
  });

  it("rejects malicious reports from non-participants before triage", () => {
    expect(isTransactionParticipant("attacker", { buyerClerkId: "buyer", sellerClerkId: "seller" })).toBe(false);
    expect(isTransactionParticipant("buyer", { buyerClerkId: "buyer", sellerClerkId: "seller" })).toBe(true);
  });
});