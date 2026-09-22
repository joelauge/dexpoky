import { createHash } from "node:crypto";

export type TradeCoachDimensionId =
  | "marketBalance"
  | "personalValue"
  | "conditionRisk"
  | "confidence";

export interface TradeCoachEvidence {
  offerId: number;
  status: string;
  listedCard: {
    name: string;
    catalogCardId: string | null;
    condition: string | null;
    exactValue: number | null;
  } | null;
  proposal: {
    from: "buyer" | "seller";
    cash: number;
    cards: Array<{
      name: string;
      catalogCardId: string | null;
      condition: string | null;
      exactValue: number | null;
    }>;
  };
  personalSignals: {
    listedCardMatchesBuyerWant: boolean;
    proposalMatchesRecipientWishlist: Array<"low" | "normal" | "high">;
  };
  traderHistory: {
    buyer: { ratingCount: number; average: number | null };
    seller: { ratingCount: number; average: number | null };
  };
}

export interface TradeCoachDimension {
  score: number | null;
  confidence: number | null;
  probabilities: Record<string, number>;
  label: string;
  message: string;
}

export interface TradeCoachResult {
  facts: {
    proposalFrom: "buyer" | "seller";
    sellerSideValue: number | null;
    buyerSideValue: number | null;
    proposalCardValue: number | null;
    proposalCash: number;
    difference: number | null;
    missingValues: string[];
  };
  judgments: Record<TradeCoachDimensionId, TradeCoachDimension>;
  evidenceHash: string;
  evaluatedAt: string;
  unavailable: boolean;
  disclaimer: string;
}

export interface TradeCoachEvaluation extends TradeCoachResult {
  audit: {
    modelVersion: string;
    evaluatorVersion: string;
  };
}

type JevAnswer = {
  type?: string;
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
};
type JevResponse = { model?: string; answers?: Record<string, JevAnswer> };

const MODEL = "jev-latest";
export const TRADE_COACH_EVALUATOR_VERSION = "trade-coach-v2";
export const TRADE_COACH_SUCCESS_TTL_MS = 30 * 60 * 1000;
const IDS: TradeCoachDimensionId[] = [
  "marketBalance",
  "personalValue",
  "conditionRisk",
  "confidence",
];

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function tradeCoachEvidenceHash(evidence: TradeCoachEvidence): string {
  return createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
}

export function deterministicTradeFacts(evidence: TradeCoachEvidence): TradeCoachResult["facts"] {
  const missingValues: string[] = [];
  if (!evidence.listedCard) missingValues.push("The card being traded is missing.");
  if (evidence.listedCard && evidence.listedCard.exactValue == null) {
    missingValues.push(`${evidence.listedCard.name} does not have an exact value.`);
  }
  for (const card of evidence.proposal.cards) {
    if (card.exactValue == null) missingValues.push(`${card.name} does not have an exact value.`);
    if (!card.condition) missingValues.push(`${card.name} does not have a confirmed condition.`);
  }
  if (evidence.listedCard && !evidence.listedCard.condition) {
    missingValues.push(`${evidence.listedCard.name} does not have a confirmed condition.`);
  }

  const listedCardValue = evidence.listedCard?.exactValue ?? null;
  const allProposalValuesKnown = evidence.proposal.cards.every((card) => card.exactValue != null);
  const proposalCardValue = allProposalValuesKnown
    ? evidence.proposal.cards.reduce((sum, card) => sum + (card.exactValue ?? 0), 0)
    : null;
  const sellerSideValue = listedCardValue == null ||
    (evidence.proposal.from === "seller" && proposalCardValue == null)
      ? null
      : listedCardValue + (evidence.proposal.from === "seller" ? (proposalCardValue ?? 0) : 0);
  const buyerSideValue = evidence.proposal.from === "buyer"
    ? proposalCardValue == null ? null : proposalCardValue + evidence.proposal.cash
    : evidence.proposal.cash;
  const difference = sellerSideValue == null || buyerSideValue == null
    ? null
    : buyerSideValue - sellerSideValue;

  return {
    proposalFrom: evidence.proposal.from,
    sellerSideValue,
    buyerSideValue,
    proposalCardValue,
    proposalCash: evidence.proposal.cash,
    difference,
    missingValues,
  };
}

function dimension(label: string, message: string): TradeCoachDimension {
  return { score: null, confidence: null, probabilities: {}, label, message };
}

function fallback(evidence: TradeCoachEvidence, evidenceHash: string): TradeCoachEvaluation {
  const facts = deterministicTradeFacts(evidence);
  return {
    facts,
    judgments: {
      marketBalance: dimension("Needs your review", "Compare the exact totals before deciding."),
      personalValue: dimension("Think about your goal", "A card can matter more to one collector than its price suggests."),
      conditionRisk: dimension(
        facts.missingValues.length ? "Missing evidence" : "Check condition",
        facts.missingValues.length
          ? "Some card values are missing. Confirm them before deciding."
          : "Confirm each card's condition before deciding.",
      ),
      confidence: dimension("Coach unavailable", "The facts are still shown, but DexPoky could not complete its judgment."),
    },
    evidenceHash,
    evaluatedAt: new Date().toISOString(),
    unavailable: true,
    disclaimer: "DexPoky offers a neutral second opinion, not a guarantee that a trade is fair.",
    audit: { modelVersion: MODEL, evaluatorVersion: TRADE_COACH_EVALUATOR_VERSION },
  };
}

function validResponse(raw: unknown): raw is JevResponse {
  if (!raw || typeof raw !== "object") return false;
  const answers = (raw as JevResponse).answers;
  return !!answers && IDS.every((id) => {
    const answer = answers[id];
    return answer?.type === "score" &&
      finite(answer.score) && answer.score >= 0 && answer.score <= 2 &&
      finite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1 &&
      !!answer.probabilities;
  });
}

function messageFor(
  id: TradeCoachDimensionId,
  score: number,
  confidence: number,
  evidence: TradeCoachEvidence,
  facts: TradeCoachResult["facts"],
): Pick<TradeCoachDimension, "label" | "message"> {
  const lowConfidence = confidence < 0.6;
  if (id === "marketBalance") {
    if (facts.sellerSideValue == null || facts.buyerSideValue == null || facts.difference == null) {
      return { label: "Unclear balance", message: "There is not enough exact value evidence to compare both sides." };
    }
    const gapRatio = Math.abs(facts.difference) / Math.max(facts.sellerSideValue, facts.buyerSideValue, 1);
    if (gapRatio <= .1) return { label: "Values look close", message: "The known market values are within 10%. Personal value can still differ." };
    if (gapRatio <= .25) return { label: "Noticeable value gap", message: "The known values differ by more than 10%. Review the exact totals before deciding." };
    return { label: "Large value gap", message: "The known values are far apart. Make sure both people understand the difference." };
  }
  if (id === "personalValue") {
    if (lowConfidence) return { label: "Personal value unclear", message: "DexPoky does not have enough preference evidence for a strong judgment." };
    if (score >= .67) return { label: "Strong personal fit", message: "The trade appears to match an important collection goal." };
    if (score >= .34) return { label: "Some personal fit", message: "The trade may help a collection goal, but the preference evidence is mixed." };
    return { label: "Low personal fit", message: "The available wishlist and wanted-card signals do not show a strong personal match." };
  }
  if (id === "conditionRisk") {
    if (evidence.listedCard?.condition == null || evidence.proposal.cards.some((card) => !card.condition)) {
      return { label: "Condition missing", message: "At least one card needs a confirmed condition before deciding." };
    }
    if (lowConfidence || score < .34) return { label: "Condition needs review", message: "Condition evidence may change how this trade feels. Check the cards closely." };
    if (score < .67) return { label: "Some condition risk", message: "Conditions are present, but a close review is still worthwhile." };
    return { label: "Condition evidence present", message: "Conditions are recorded. Confirm them against the actual cards." };
  }
  if (facts.missingValues.length > 0) {
    return { label: "Low confidence", message: "Important value or condition evidence is missing. Gather more details before deciding." };
  }
  if (lowConfidence || score < .34) return { label: "Low confidence", message: "Important evidence is missing or uncertain. Gather more details before deciding." };
  if (score < .67) return { label: "Medium confidence", message: "DexPoky has a useful read, but you should still review the details." };
  return { label: "Higher confidence", message: "The available evidence supports a clearer judgment, but the choice is still yours." };
}

export async function evaluateTrade(evidence: TradeCoachEvidence): Promise<TradeCoachEvaluation> {
  const evidenceHash = tradeCoachEvidenceHash(evidence);
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return fallback(evidence, evidenceHash);

  const questions = {
    marketBalance: {
      type: "score",
      instructions: "How closely balanced are the two sides by known market value? Missing exact values must reduce certainty. Do not treat market value as the whole decision.",
      criteria: ["large or unknown value gap", "noticeable gap", "known values are reasonably close"],
    },
    personalValue: {
      type: "score",
      instructions: "How strongly does this exchange fit the collectors' stated wanted-card and wishlist priorities? Judge only supplied preference evidence.",
      criteria: ["no clear personal fit", "some fit", "strong fit to an important stated goal"],
    },
    conditionRisk: {
      type: "score",
      instructions: "How strong is the supplied condition evidence for safely reviewing this trade? This is not an authenticity judgment.",
      criteria: ["missing or highly uncertain", "present but needs close review", "conditions are clearly recorded"],
    },
    confidence: {
      type: "score",
      instructions: "How complete and reliable is the supplied evidence for giving a neutral trade review? Missing prices, condition, or history must lower the score.",
      criteria: ["too incomplete for a useful judgment", "partly complete", "substantially complete"],
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state: evidence, questions }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    const raw = await response.json() as unknown;
    if (!validResponse(raw)) throw new Error("Invalid TypeSafe response");
    const answers = (raw as JevResponse).answers!;
    const facts = deterministicTradeFacts(evidence);
    const judgments = Object.fromEntries(IDS.map((id) => {
      const answer = answers[id];
      const rawScore = clamp((answer.score ?? 0) / 2);
      const rawConfidence = clamp(answer.confidence ?? 0);
      const incomplete = facts.missingValues.length > 0;
      const score = id === "confidence" && incomplete ? Math.min(rawScore, .33) : rawScore;
      const confidence = id === "confidence" && incomplete ? Math.min(rawConfidence, .5) : rawConfidence;
      return [id, {
        score,
        confidence,
        probabilities: answer.probabilities ?? {},
        ...messageFor(id, score, confidence, evidence, facts),
      }];
    })) as Record<TradeCoachDimensionId, TradeCoachDimension>;
    return {
      facts,
      judgments,
      evidenceHash,
      evaluatedAt: new Date().toISOString(),
      unavailable: false,
      disclaimer: "DexPoky offers a neutral second opinion, not a guarantee that a trade is fair.",
      audit: {
        modelVersion: (raw as JevResponse).model ?? MODEL,
        evaluatorVersion: TRADE_COACH_EVALUATOR_VERSION,
      },
    };
  } catch {
    return fallback(evidence, evidenceHash);
  } finally {
    clearTimeout(timer);
  }
}