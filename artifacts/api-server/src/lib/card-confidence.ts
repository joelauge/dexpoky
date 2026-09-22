import { createHash } from "node:crypto";

export type ConfidenceStatus = "safe" | "needs_review" | "blocked" | "unknown" | "unavailable";
export type ConfidenceAction =
  | "none"
  | "confirm_printing"
  | "add_exact_price"
  | "confirm_condition"
  | "complete_listing"
  | "retry";

export interface CardConfidenceInput {
  observed: {
    visionConfidence?: "high" | "medium" | "low" | number | null;
    ocrName?: string | null;
    ocrSetCode?: string | null;
    ocrCardNumber?: string | null;
  };
  candidate: {
    id: string;
    name?: string | null;
    setId?: string | null;
    setName?: string | null;
    cardNumber?: string | null;
  } | null;
  pricing: {
    marketPrice?: number | null;
    lowPrice?: number | null;
    source?: string | null;
    evidenceAt?: string | null;
    isFallback?: boolean;
  } | null;
  condition?: { value?: string | null; source?: string | null } | null;
  context?: Record<string, unknown>;
}

export interface ConfidenceDimension {
  score: number | null;
  probabilities: Record<string, number>;
  confidence: number | null;
  status: ConfidenceStatus;
  action: ConfidenceAction;
  message: string;
}

export interface CardConfidenceResult {
  dimensions: {
    printingIdentity: ConfidenceDimension;
    priceEvidence: ConfidenceDimension;
    conditionCertainty: ConfidenceDimension;
    listingReadiness: ConfidenceDimension;
  };
  modelVersion: string;
  evaluatedAt: string;
  evidenceHash: string;
  evidenceFresh: boolean;
  unavailable: boolean;
  authenticityDisclaimer: string;
  modelResponse?: unknown;
}

type JevAnswer = { type?: string; score?: number; confidence?: number; probabilities?: Record<string, number> };
type JevResponse = { model?: string; answers?: Record<string, JevAnswer> };

const MODEL = "jev-latest";
const FRESH_MS = 24 * 60 * 60 * 1000;

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizeCardNumber(value: unknown): string {
  return normalize(String(value ?? "").split("/")[0]);
}
function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function hashEvidence(input: CardConfidenceInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function dim(status: ConfidenceStatus, action: ConfidenceAction, message: string, score: number | null = null): ConfidenceDimension {
  return { score, probabilities: {}, confidence: null, status, action, message };
}

/** Code-owned gates surround Jev: model confidence can never override catalog or price facts. */
export function deterministicGates(input: CardConfidenceInput): Omit<CardConfidenceResult, "modelVersion" | "evaluatedAt" | "modelResponse"> {
  const candidate = input.candidate;
  const observedSet = normalize(input.observed.ocrSetCode);
  const observedNumber = normalizeCardNumber(input.observed.ocrCardNumber);
  const candidateSet = normalize(candidate?.setId);
  const candidateNumber = normalizeCardNumber(candidate?.cardNumber);
  const identityKnown = !!candidate && !!observedSet && !!observedNumber;
  const exactIdentity = identityKnown && observedSet === candidateSet && observedNumber === candidateNumber;
  const identityMismatch = identityKnown && (observedSet !== candidateSet || observedNumber !== candidateNumber);
  const hasExactPrice = !!input.pricing && !input.pricing.isFallback && !!input.pricing.source &&
    (number(input.pricing.marketPrice) != null || number(input.pricing.lowPrice) != null);
  const conditionKnown = !!input.condition?.value;
  const listingReady = exactIdentity && hasExactPrice && conditionKnown;
  const fresh = !input.pricing?.evidenceAt || Date.now() - new Date(input.pricing.evidenceAt).getTime() <= FRESH_MS;

  return {
    dimensions: {
      printingIdentity: identityMismatch
        ? dim("blocked", "confirm_printing", "Observed set and card number do not match this printing.")
        : exactIdentity
          ? dim("safe", "none", "Exact catalog set and card number match the scan.", 1)
          : dim("unknown", "confirm_printing", "Confirm the printing; set code and card number evidence is incomplete."),
      priceEvidence: !hasExactPrice
        ? dim("blocked", "add_exact_price", "No exact-printing price evidence is available.")
        : !fresh
          ? dim("needs_review", "add_exact_price", "Price evidence is stale; refresh the exact printing price.")
          : dim("safe", "none", `Exact price evidence is available from ${input.pricing?.source}.`, 1),
      conditionCertainty: conditionKnown
        ? dim("needs_review", "confirm_condition", "Condition was selected; confirm it against the scan.", 0.75)
        : dim("unknown", "confirm_condition", "Condition is not selected."),
      listingReadiness: listingReady
        ? dim("needs_review", "complete_listing", "Evidence is present; review condition before listing.", 0.8)
        : dim("blocked", "complete_listing", "Complete printing, exact price, and condition evidence before listing."),
    },
    evidenceHash: hashEvidence(input),
    evidenceFresh: fresh,
    unavailable: false,
    authenticityDisclaimer: "Evidence confidence is not proof of authenticity.",
  };
}

function validateJev(response: unknown, ids: string[]): response is JevResponse {
  if (!response || typeof response !== "object") return false;
  const answers = (response as JevResponse).answers;
  return !!answers && ids.every((id) => answers[id]?.type === "score" && number(answers[id]?.score) != null);
}

export async function evaluateCardConfidence(input: CardConfidenceInput): Promise<CardConfidenceResult> {
  const base = deterministicGates(input);
  const evaluatedAt = new Date().toISOString();
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return { ...base, modelVersion: MODEL, evaluatedAt, unavailable: true };
  }
  const questions = {
    printingIdentity: { type: "score", instructions: "How strong is the printing identity evidence? Score only the evidence, not authenticity.", criteria: ["unknown or conflicting", "partial", "exact catalog set and number match"] },
    priceEvidence: { type: "score", instructions: "How strong is the exact-printing price evidence?", criteria: ["missing or stale", "weak or indirect", "fresh exact source"] },
    conditionCertainty: { type: "score", instructions: "How certain is the selected card condition from the provided context?", criteria: ["unknown", "selected but needs confirmation", "clearly supported"] },
    listingReadiness: { type: "score", instructions: "How ready is this card evidence for a listing review?", criteria: ["blocked", "needs manual review", "ready for review"] },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, state: input, questions }), signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    const raw = await response.json() as unknown;
    const ids = Object.keys(questions);
    if (!validateJev(raw, ids)) throw new Error("Invalid TypeSafe response");
    const answers = (raw as JevResponse).answers!;
    const dimensions = { ...base.dimensions };
    for (const id of ids) {
      const answer = answers[id];
      const target = dimensions[id as keyof typeof dimensions];
      const score = Math.max(0, Math.min(1, (answer.score ?? 0) / 2));
      target.score = score;
      target.confidence = number(answer.confidence);
      target.probabilities = answer.probabilities ?? {};
    }
    // Deterministic gates are authoritative even if Jev is overconfident.
    return { ...base, dimensions, modelVersion: raw.model ?? MODEL, evaluatedAt, modelResponse: raw };
  } catch {
    return { ...base, modelVersion: MODEL, evaluatedAt, unavailable: true };
  } finally {
    clearTimeout(timer);
  }
}