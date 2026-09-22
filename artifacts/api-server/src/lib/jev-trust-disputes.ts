import { createHash } from "crypto";

export const TRUST_EVALUATOR_VERSION = "trust-v1";
export const TRIAGE_EVALUATOR_VERSION = "triage-v1";

export type TrustDimension = "communication" | "listingAccuracy" | "fulfillment" | "transactionHistory";
export type IssueCategory = "payment" | "item_not_received" | "item_not_as_described" | "counterfeit" | "communication" | "safety" | "other";
export type Urgency = "routine" | "priority" | "urgent";

export interface TrustState {
  ratingCount: number;
  completedTransactions: number;
  averageScore: number | null;
  communicationAverage: number | null;
  conditionAverage: number | null;
  shippingAverage: number | null;
  valueAverage: number | null;
  negativeCount: number;
  recentNegativeCount: number;
}

export interface TrustSignal {
  score: number | null;
  confidence: number;
  evidence: string[];
  uncertain: boolean;
}

export interface TrustResult {
  dimensions: Record<TrustDimension, TrustSignal>;
  historyLabel: "new" | "limited" | "established";
  unavailable: boolean;
  evaluatedAt: string;
}

export interface DisputeTriageInput {
  description: string;
  declaredCategory: string | null;
  transaction: {
    offerId: number;
    status: string;
    paymentStatus: string | null;
    paymentMethod: string | null;
    amountCents: number | null;
  };
  evidenceProvided: {
    transactionId: boolean;
    paymentReceipt: boolean;
    tracking: boolean;
    itemPhotos: boolean;
    messages: boolean;
  };
  priorReportsByReporter: number;
}

export interface DisputeTriageResult {
  category: IssueCategory;
  urgency: Urgency;
  confidence: number;
  missingEvidence: string[];
  reviewState: "needs_evidence" | "queued_for_review" | "priority_human_review";
  route: "payments_review" | "delivery_review" | "item_review" | "conduct_review" | "general_review";
  escalated: boolean;
  unavailable: boolean;
  facts: string[];
}

interface ChoiceAnswer { choice?: unknown; confidence?: unknown }
interface ScoreAnswer { score?: unknown; confidence?: unknown }
interface NoulAnswer { probability?: unknown }

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function systemOne(state: unknown, questions: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!process.env.TYPESAFE_API_KEY) return null;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "jev-latest", state, questions }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { answers?: unknown };
    return payload.answers && typeof payload.answers === "object" && !Array.isArray(payload.answers)
      ? payload.answers as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizedAverage(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value != null);
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length / 5 : null;
}

function evidenceForTrust(state: TrustState): Record<TrustDimension, string[]> {
  return {
    communication: state.communicationAverage == null
      ? ["No communication sub-ratings yet"]
      : [`Communication rated ${state.communicationAverage.toFixed(1)}/5 across completed transactions`],
    listingAccuracy: [
      state.conditionAverage == null ? "No condition-accuracy sub-ratings yet" : `Condition accuracy rated ${state.conditionAverage.toFixed(1)}/5`,
      state.valueAverage == null ? "No value sub-ratings yet" : `Value accuracy rated ${state.valueAverage.toFixed(1)}/5`,
    ],
    fulfillment: state.shippingAverage == null
      ? ["No fulfillment sub-ratings yet"]
      : [`Fulfillment rated ${state.shippingAverage.toFixed(1)}/5`],
    transactionHistory: [
      `${state.completedTransactions} completed transaction${state.completedTransactions === 1 ? "" : "s"}`,
      `${state.negativeCount} negative rating${state.negativeCount === 1 ? "" : "s"}`,
      `${state.recentNegativeCount} negative rating${state.recentNegativeCount === 1 ? "" : "s"} in the last 90 days`,
    ],
  };
}

function deterministicTrust(state: TrustState): TrustResult {
  const evidence = evidenceForTrust(state);
  const sampleConfidence = Math.min(1, state.ratingCount / 10);
  const scores: Record<TrustDimension, number | null> = {
    communication: normalizedAverage([state.communicationAverage]),
    listingAccuracy: normalizedAverage([state.conditionAverage, state.valueAverage]),
    fulfillment: normalizedAverage([state.shippingAverage]),
    transactionHistory: state.completedTransactions === 0
      ? null
      : Math.max(0, Math.min(1,
        1
        - (state.negativeCount / Math.max(1, state.ratingCount)) * .7
        - (state.recentNegativeCount / Math.max(1, state.ratingCount)) * .3,
      )),
  };
  return {
    dimensions: Object.fromEntries(Object.entries(scores).map(([dimension, score]) => [
      dimension,
      { score, confidence: score == null ? 0 : sampleConfidence, evidence: evidence[dimension as TrustDimension], uncertain: score == null || sampleConfidence < .5 },
    ])) as Record<TrustDimension, TrustSignal>,
    historyLabel: state.completedTransactions >= 10 ? "established" : state.completedTransactions >= 3 ? "limited" : "new",
    unavailable: true,
    evaluatedAt: new Date().toISOString(),
  };
}

export async function evaluateTrust(state: TrustState): Promise<TrustResult> {
  const fallback = deterministicTrust(state);
  const questions = Object.fromEntries((["communication", "listingAccuracy", "fulfillment", "transactionHistory"] as TrustDimension[]).map((dimension) => [
    dimension,
    {
      type: "score",
      instructions: {
        question: `How strong is the observed ${dimension} reliability signal?`,
        dimension,
        constraints: "Use only aggregate observed facts. Sparse or conflicting history should score conservatively. Do not infer fraud, intent, identity, or private-message content.",
      },
      criteria: [
        "Observed facts indicate substantial reliability concerns.",
        "Evidence is sparse, mixed, or broadly average.",
        "Observed completed-transaction facts consistently support reliability.",
      ],
    },
  ]));
  const answers = await systemOne({ ...state, evidenceHash: hash(state) }, questions);
  if (!answers) return fallback;

  const dimensions = { ...fallback.dimensions };
  for (const dimension of Object.keys(dimensions) as TrustDimension[]) {
    const answer = answers[dimension] as ScoreAnswer | undefined;
    if (
      !answer || typeof answer.score !== "number" || answer.score < 0 || answer.score > 2 ||
      typeof answer.confidence !== "number" || answer.confidence < 0 || answer.confidence > 1
    ) return fallback;
    dimensions[dimension] = {
      ...dimensions[dimension],
      score: answer.score / 2,
      confidence: answer.confidence,
      uncertain: answer.confidence < .55 || state.ratingCount < 3,
    };
  }
  return { ...fallback, dimensions, unavailable: false };
}

const evidenceByCategory: Record<IssueCategory, Array<keyof DisputeTriageInput["evidenceProvided"]>> = {
  payment: ["transactionId", "paymentReceipt", "messages"],
  item_not_received: ["transactionId", "tracking", "messages"],
  item_not_as_described: ["transactionId", "itemPhotos", "messages"],
  counterfeit: ["transactionId", "itemPhotos", "messages"],
  communication: ["transactionId", "messages"],
  safety: ["transactionId", "messages"],
  other: ["transactionId", "messages"],
};
const evidenceLabels: Record<keyof DisputeTriageInput["evidenceProvided"], string> = {
  transactionId: "Transaction or trade ID",
  paymentReceipt: "Payment receipt or charge record",
  tracking: "Carrier tracking or delivery status",
  itemPhotos: "Clear photos of the received item and packaging",
  messages: "Relevant conversation screenshots or message dates",
};

function deterministicCategory(input: DisputeTriageInput): IssueCategory {
  const text = `${input.declaredCategory ?? ""} ${input.description}`.toLowerCase();
  if (/\b(counterfeit|fake|forged)\b/.test(text)) return "counterfeit";
  if (/\b(threat|unsafe|harass|violence|stalk)\b/.test(text)) return "safety";
  if (/\b(refund|charge|charged|payment|wallet|money)\b/.test(text)) return "payment";
  if (/\b(not received|never arrived|tracking|delivery)\b/.test(text)) return "item_not_received";
  if (/\b(damaged|condition|not as described|wrong card)\b/.test(text)) return "item_not_as_described";
  if (/\b(message|respond|reply|communication)\b/.test(text)) return "communication";
  return "other";
}

export async function triageDispute(input: DisputeTriageInput): Promise<DisputeTriageResult> {
  const fallbackCategory = deterministicCategory(input);
  const questions: Record<string, unknown> = {
    category: {
      type: "choice",
      instructions: "Choose the single best issue category for routing. This is intake triage, not a finding of fault or fraud.",
      criteria: {
        payment: "Payment, wallet, charge, payout, or refund concern.",
        item_not_received: "Delivery or non-receipt concern.",
        item_not_as_described: "Condition, wrong-item, or listing-accuracy concern.",
        counterfeit: "Authenticity concern; this is an allegation requiring evidence and human review.",
        communication: "Communication or responsiveness concern without a safety allegation.",
        safety: "Threat, harassment, coercion, or personal-safety concern.",
        other: "Does not fit another category.",
      },
    },
    urgency: {
      type: "score",
      instructions: "How urgently should a human review this report? Do not decide fault, refunds, account action, or payment action.",
      criteria: ["Routine support queue", "Priority review soon", "Urgent human safety or active financial-risk review"],
    },
  };
  for (const key of Object.keys(input.evidenceProvided) as Array<keyof typeof input.evidenceProvided>) {
    questions[`missing_${key}`] = {
      type: "noul",
      instructions: `Would ${evidenceLabels[key]} materially help a human review this report, and is it currently missing?`,
      criteria: { true: "Useful and missing", false: "Already provided or not useful for this issue" },
    };
  }
  const answers = await systemOne(input, questions);
  let category = fallbackCategory;
  let urgency: Urgency = ["counterfeit", "safety", "payment"].includes(category) ? "urgent" : "routine";
  let confidence = 0;
  let unavailable = true;
  if (answers) {
    const categoryAnswer = answers.category as ChoiceAnswer | undefined;
    const urgencyAnswer = answers.urgency as ScoreAnswer | undefined;
    const validCategories: IssueCategory[] = ["payment", "item_not_received", "item_not_as_described", "counterfeit", "communication", "safety", "other"];
    if (
      categoryAnswer && validCategories.includes(categoryAnswer.choice as IssueCategory) &&
      typeof categoryAnswer.confidence === "number" && categoryAnswer.confidence >= 0 && categoryAnswer.confidence <= 1 &&
      urgencyAnswer && typeof urgencyAnswer.score === "number" && urgencyAnswer.score >= 0 && urgencyAnswer.score <= 2 &&
      typeof urgencyAnswer.confidence === "number" && urgencyAnswer.confidence >= 0 && urgencyAnswer.confidence <= 1
    ) {
      category = categoryAnswer.choice as IssueCategory;
      urgency = urgencyAnswer.score >= 1.5 ? "urgent" : urgencyAnswer.score >= .5 ? "priority" : "routine";
      confidence = Math.min(categoryAnswer.confidence, urgencyAnswer.confidence);
      unavailable = false;
    }
  }

  const serious = ["payment", "counterfeit", "safety"].includes(category);
  if (serious) urgency = "urgent";
  const relevantEvidence = evidenceByCategory[category];
  const missingEvidence = relevantEvidence
    .filter((key) => {
      if (input.evidenceProvided[key]) return false;
      const answer = answers?.[`missing_${key}`] as NoulAnswer | undefined;
      return unavailable || !answer || typeof answer.probability !== "number" || answer.probability >= .5;
    })
    .map((key) => evidenceLabels[key]);
  const lowConfidence = unavailable || confidence < .55;
  const escalated = serious || urgency === "urgent" || lowConfidence;
  const reviewState = escalated
    ? "priority_human_review"
    : missingEvidence.length ? "needs_evidence" : "queued_for_review";
  const route = category === "payment" ? "payments_review"
    : category === "item_not_received" ? "delivery_review"
      : ["item_not_as_described", "counterfeit"].includes(category) ? "item_review"
        : ["communication", "safety"].includes(category) ? "conduct_review" : "general_review";

  return {
    category,
    urgency,
    confidence,
    missingEvidence,
    reviewState,
    route,
    escalated,
    unavailable,
    facts: [
      `Trade #${input.transaction.offerId} status: ${input.transaction.status}`,
      input.transaction.paymentStatus ? `Recorded payment status: ${input.transaction.paymentStatus}` : "No completed payment record found",
      `${Object.values(input.evidenceProvided).filter(Boolean).length} evidence item${Object.values(input.evidenceProvided).filter(Boolean).length === 1 ? "" : "s"} marked as provided`,
    ],
  };
}

export function isTransactionParticipant(
  reporterClerkId: string,
  transaction: { buyerClerkId: string; sellerClerkId: string },
): boolean {
  return reporterClerkId === transaction.buyerClerkId || reporterClerkId === transaction.sellerClerkId;
}