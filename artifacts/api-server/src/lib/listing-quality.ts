import { createHash } from "crypto";

export interface ListingCardEvidence {
  id: number;
  name: string;
  pokemonName: string;
  setName: string | null;
  setId: string | null;
  cardNumber: string | null;
  catalogCardId: string | null;
  condition: string;
  estimatedValue: number | null;
  originalScanUrl: string | null;
}

export interface ListingDraftEvidence {
  listingType: "buy_now" | "auction";
  price: number;
  description: string | null;
  listingImages: string[];
  startingBid: number | null;
  reservePrice: number | null;
  buyNowPrice: number | null;
  minBidIncrement: number | null;
  auctionEndTime: string | null;
}

export interface ListingQualityDimension {
  score: number;
  confidence: number;
  label: "Strong" | "Needs attention" | "Unclear";
}

export interface ListingQualityReview {
  evidenceHash: string;
  reviewedAt: string;
  evaluatorVersion: string;
  unavailable: boolean;
  canPublish: boolean;
  hardIssues: string[];
  dimensions: {
    completeness: ListingQualityDimension;
    clarity: ListingQualityDimension;
    consistency: ListingQualityDimension;
    evidence: ListingQualityDimension;
  };
  suggestions: string[];
  disclaimer: string;
}

interface JevAnswer { score?: number; confidence?: number; probabilities?: Record<string, number> }
const VERSION = "listing-quality-v1";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").trim();
}

export function listingHardIssues(
  card: ListingCardEvidence,
  draft: ListingDraftEvidence,
  hasVerifiedGrade: boolean,
  now = Date.now(),
): string[] {
  const issues: string[] = [];
  if (!card.name.trim() || !card.pokemonName.trim() || (!card.catalogCardId && (!card.setId || !card.cardNumber))) {
    issues.push("Confirm the card identity, set, and card number before publishing.");
  }
  if (!Number.isFinite(draft.price) || draft.price <= 0) issues.push("Enter a valid price greater than $0.");
  if (draft.listingType === "auction") {
    if (draft.startingBid == null || !Number.isFinite(draft.startingBid) || draft.startingBid <= 0) issues.push("Enter a valid starting bid.");
    if (!draft.auctionEndTime || new Date(draft.auctionEndTime).getTime() <= now) issues.push("Choose an auction end time in the future.");
    if (draft.minBidIncrement == null || !Number.isFinite(draft.minBidIncrement) || draft.minBidIncrement <= 0) issues.push("Enter a positive minimum bid increment.");
    if (draft.reservePrice != null && draft.startingBid != null && draft.reservePrice < draft.startingBid) issues.push("Reserve price cannot be below the starting bid.");
    if (draft.buyNowPrice != null && draft.startingBid != null && draft.buyNowPrice <= draft.startingBid) issues.push("Buy It Now price must be higher than the starting bid.");
  }
  const description = normalize(draft.description ?? "");
  const condition = normalize(card.condition);
  const claimsMint = /\b(mint|gem mint|pristine|perfect condition)\b/.test(description);
  if (claimsMint && !["mint", "near mint"].includes(condition)) {
    issues.push(`The description claims mint condition, but the saved condition is ${condition}.`);
  }
  if (/\b(psa|bgs|cgc|tag)\s*(10|9\.5|9|8\.5|8)\b|\bcertified\b|\bgraded\b/.test(description) && !hasVerifiedGrade) {
    issues.push("Remove the grading/certification claim or verify the grading certificate first.");
  }
  return issues;
}

function suggestionsFor(card: ListingCardEvidence, draft: ListingDraftEvidence): string[] {
  const suggestions: string[] = [];
  const description = draft.description?.trim() ?? "";
  if (description.length < 30) suggestions.push("Add a clearer condition note, including any whitening, scratches, bends, or edge wear.");
  if (draft.listingImages.length === 0 && !card.originalScanUrl) suggestions.push("Add clear front and back photos of the actual card.");
  else if (draft.listingImages.length < 2) suggestions.push("Add a second photo showing the back or any condition flaws.");
  if (!card.setId || !card.cardNumber) suggestions.push("Confirm the set and card number so buyers know the exact printing.");
  if (/holo|reverse|foil/i.test(card.name + " " + (card.setName ?? "")) && !/holo|reverse|foil/i.test(description)) {
    suggestions.push("Confirm the card finish (regular, holo, reverse holo, or other variant).");
  }
  if (card.estimatedValue && draft.price > card.estimatedValue * 3) suggestions.push("Explain why the asking price is substantially above the saved market estimate.");
  return suggestions.slice(0, 4);
}

function dimension(score: number, confidence: number): ListingQualityDimension {
  return {
    score,
    confidence,
    label: confidence < .55 ? "Unclear" : score >= .67 ? "Strong" : "Needs attention",
  };
}

function validAnswers(value: unknown): value is Record<string, Required<Pick<JevAnswer, "score" | "confidence">> & JevAnswer> {
  const ids = ["completeness", "clarity", "consistency", "evidence"];
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rows = value as Record<string, unknown>;
  if (Object.keys(rows).length !== ids.length || ids.some((id) => !(id in rows))) return false;
  return ids.every((id) => {
    const row = rows[id] as Record<string, unknown>;
    return !!row && typeof row === "object" &&
      typeof row.score === "number" && Number.isFinite(row.score) && row.score >= 0 && row.score <= 2 &&
      typeof row.confidence === "number" && Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 1;
  });
}

export async function reviewListingQuality(
  card: ListingCardEvidence,
  draft: ListingDraftEvidence,
  hasVerifiedGrade: boolean,
): Promise<ListingQualityReview> {
  const state = { card, draft, hasVerifiedGrade };
  const evidenceHash = createHash("sha256").update(JSON.stringify(state)).digest("hex");
  const hardIssues = listingHardIssues(card, draft, hasVerifiedGrade);
  const suggestions = suggestionsFor(card, draft);
  const fallback = {
    completeness: dimension(suggestions.length ? .45 : .8, 0),
    clarity: dimension(draft.description?.trim() ? .55 : .25, 0),
    consistency: dimension(hardIssues.length ? .15 : .75, 0),
    evidence: dimension(draft.listingImages.length || card.originalScanUrl ? .55 : .2, 0),
  };
  const base = {
    evidenceHash,
    reviewedAt: new Date().toISOString(),
    evaluatorVersion: VERSION,
    canPublish: hardIssues.length === 0,
    hardIssues,
    suggestions,
    disclaimer: "This review checks listing quality and consistency. It does not authenticate or guarantee the card.",
  };
  if (!process.env.TYPESAFE_API_KEY) return { ...base, unavailable: true, dimensions: fallback };

  const questions = Object.fromEntries([
    ["completeness", "How complete is this draft for a buyer to identify the exact item and understand the transaction?"],
    ["clarity", "How clear and unambiguous are the seller's description and terms?"],
    ["consistency", "How internally consistent are the seller's claims with the structured card identity, condition, and price context? Do not override hardIssues."],
    ["evidence", "How well do the listed photos, scan, identity fields, and verified grading state support the seller's claims? Never infer authenticity."],
  ].map(([id, instructions]) => [id, {
    type: "score",
    instructions,
    criteria: [
      "Important information is missing, unclear, or unsupported.",
      "Usable but incomplete or ambiguous.",
      "Specific, clear, consistent, and supported by supplied evidence.",
    ],
  }]));
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { ...base, unavailable: true, dimensions: fallback };
    const payload = await response.json() as { answers?: unknown };
    const answers = payload.answers;
    if (!validAnswers(answers)) return { ...base, unavailable: true, dimensions: fallback };
    return {
      ...base,
      unavailable: false,
      dimensions: {
        completeness: dimension(answers.completeness.score / 2, answers.completeness.confidence),
        clarity: dimension(answers.clarity.score / 2, answers.clarity.confidence),
        consistency: dimension(answers.consistency.score / 2, answers.consistency.confidence),
        evidence: dimension(answers.evidence.score / 2, answers.evidence.confidence),
      },
    };
  } catch {
    return { ...base, unavailable: true, dimensions: fallback };
  }
}