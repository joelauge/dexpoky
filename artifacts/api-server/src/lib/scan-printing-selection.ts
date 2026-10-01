import { createHash } from "node:crypto";

export interface ScanPrintingCandidate {
  id: string;
  name: string;
  setId?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  rarity?: string | null;
  pokemonName?: string | null;
}

export interface ScanPrintingEvidence {
  name: string;
  setCode?: string;
  cardNumber?: string;
  visionConfidence?: "high" | "medium" | "low";
  visualSummary?: string;
  hp?: number;
}

export interface ScanPrintingSelection {
  status: "exact" | "likely" | "review" | "unavailable";
  recommendedId: string | null;
  confidence: number | null;
  message: string;
}

interface ChoiceAnswer {
  type?: unknown;
  choice?: unknown;
  confidence?: unknown;
  probabilities?: unknown;
}

interface JevPayload {
  answers?: unknown;
}

const MODEL = "jev-latest";
const QUESTION_ID = "printing";
const EVALUATOR_VERSION = "scan-printing-choice-v1";
const MAX_CHOICE_OPTIONS = 255;
const MAX_CANDIDATES = MAX_CHOICE_OPTIONS - 1; // Reserve one explicit no_match option.
const JEV_TIMEOUT_MS = 7_000;
const SUCCESS_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 250;
const PROBABILITY_SUM_TOLERANCE = 0.015;

// Initial safety thresholds, not measured accuracy claims. Revisit with labeled scan outcomes.
const MIN_CONFIDENCE = 0.7;
const MIN_SELECTED_PROBABILITY = 0.65;
const MIN_PROBABILITY_MARGIN = 0.15;

const selectionCache = new Map<string, { value: ScanPrintingSelection; expiresAt: number }>();
const inFlight = new Map<string, Promise<ScanPrintingSelection>>();

const unavailable = (): ScanPrintingSelection => ({
  status: "unavailable",
  recommendedId: null,
  confidence: null,
  message: "A printing suggestion is unavailable right now. Please review the options.",
});

function normalizedSetCode(value: string): string {
  return value.toLowerCase()
    .replace(/\s+(?:en|jp|fr|de|es|it|pt)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/^([a-z]+)0+(\d+)$/, "$1$2");
}

function normalizedCardNumber(value: string): string {
  const compact = value.trim().toLowerCase().replace(/\s+/g, "");
  const slashMatch = compact.match(/^([^/]+)\/\d+$/);
  const primary = slashMatch?.[1] ?? compact;
  if (/^\d+$/.test(primary)) return primary.replace(/^0+(?=\d)/, "");
  return primary;
}

function sameCardNumber(left: string, right: string): boolean {
  const normalizedLeft = normalizedCardNumber(left);
  const normalizedRight = normalizedCardNumber(right);
  return !!normalizedLeft && normalizedLeft === normalizedRight;
}

function observedIdentifierMatch(
  candidate: ScanPrintingCandidate,
  evidence: ScanPrintingEvidence,
): boolean {
  if (!evidence.setCode?.trim() || !evidence.cardNumber?.trim()) return false;
  if (!candidate.setId?.trim() || !candidate.cardNumber?.trim()) return false;
  return normalizedSetCode(candidate.setId) === normalizedSetCode(evidence.setCode) &&
    sameCardNumber(candidate.cardNumber, evidence.cardNumber);
}

function contradictsObservedIdentifiers(
  candidate: ScanPrintingCandidate,
  evidence: ScanPrintingEvidence,
): boolean {
  if (evidence.setCode?.trim() && candidate.setId?.trim() &&
      normalizedSetCode(candidate.setId) !== normalizedSetCode(evidence.setCode)) {
    return true;
  }
  if (evidence.cardNumber?.trim() && candidate.cardNumber?.trim()) {
    // A populated but non-matching catalog number is not safe to promote.
    if (!sameCardNumber(candidate.cardNumber, evidence.cardNumber)) return true;
  }
  return false;
}

function normalizeCardName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function hasNameEvidence(candidate: ScanPrintingCandidate, evidence: ScanPrintingEvidence): boolean {
  const observedName = normalizeCardName(evidence.name);
  if (observedName.length < 3) return false;
  const candidateNames = [candidate.name, candidate.pokemonName]
    .filter((value): value is string => typeof value === "string")
    .map(normalizeCardName)
    .filter(Boolean);
  return candidateNames.some((candidateName) => candidateName.length >= 3 && (
    candidateName === observedName ||
    candidateName.includes(observedName) ||
    observedName.includes(candidateName)
  ));
}

function hasCatalogIdentifiers(candidate: ScanPrintingCandidate): boolean {
  return !!candidate.setId?.trim() || !!candidate.cardNumber?.trim();
}

function normalizedEvidence(evidence: ScanPrintingEvidence): Record<string, string | number | null> {
  return {
    name: evidence.name,
    setCode: evidence.setCode ?? null,
    cardNumber: evidence.cardNumber ?? null,
    visionConfidence: evidence.visionConfidence ?? null,
    visualSummary: evidence.visualSummary ?? null,
    hp: evidence.hp ?? null,
  };
}

function candidateMetadata(candidate: ScanPrintingCandidate): Record<string, string | null> {
  return {
    id: candidate.id,
    name: candidate.name,
    pokemonName: candidate.pokemonName ?? null,
    setId: candidate.setId ?? null,
    setName: candidate.setName ?? null,
    cardNumber: candidate.cardNumber ?? null,
    rarity: candidate.rarity ?? null,
  };
}

function evidenceHash(candidates: ScanPrintingCandidate[], evidence: ScanPrintingEvidence): string {
  return createHash("sha256").update(JSON.stringify({
    evaluator: EVALUATOR_VERSION,
    evidence: normalizedEvidence(evidence),
    candidates: candidates.map(candidateMetadata),
  })).digest("hex");
}

function questionFor(options: Array<{ key: string; description: string }>): Record<string, unknown> {
  return {
    type: "choice",
    instructions: {
      question: "Which single catalog printing best matches the scanned card evidence?",
      constraints: [
        "Choose only among the supplied candidate options, or no_match.",
        "Use only the OCR name, observed set/card number, stated visionConfidence, stated visualSummary, stated numeric HP, and catalog text fields.",
        "Treat visionConfidence only as the upstream system's uncertainty label; it is not a measured accuracy guarantee.",
        "The visualSummary is a text description of observed image features; no image or artwork is available to you.",
        "Do not infer visual details, set codes, card numbers, or HP that are not present in the supplied evidence.",
        "Treat observed set and card number as authoritative; do not choose a candidate that conflicts with either known identifier.",
        "Choose no_match if the evidence does not clearly fit a supplied printing.",
      ],
    },
    criteria: Object.fromEntries(options.map(({ key, description }) => [key, description])),
  };
}

function validChoiceAnswer(
  value: unknown,
  allowedOptions: Set<string>,
): { choice: string; confidence: number; probabilities: Record<string, number> } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answer = value as ChoiceAnswer;
  if (answer.type !== "choice" || typeof answer.choice !== "string" || !allowedOptions.has(answer.choice)) return null;
  if (typeof answer.confidence !== "number" || !Number.isFinite(answer.confidence) ||
      answer.confidence < 0 || answer.confidence > 1) return null;
  if (!answer.probabilities || typeof answer.probabilities !== "object" || Array.isArray(answer.probabilities)) return null;

  const probabilities = answer.probabilities as Record<string, unknown>;
  const keys = Object.keys(probabilities);
  if (keys.length !== allowedOptions.size || keys.some((key) => !allowedOptions.has(key))) return null;
  const parsed: Record<string, number> = {};
  let total = 0;
  for (const key of allowedOptions) {
    const probability = probabilities[key];
    if (typeof probability !== "number" || !Number.isFinite(probability) || probability < 0 || probability > 1) return null;
    parsed[key] = probability;
    total += probability;
  }
  if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) return null;

  const highest = Math.max(...Object.values(parsed));
  if (highest - parsed[answer.choice]! > 0.001) return null;
  return { choice: answer.choice, confidence: answer.confidence, probabilities: parsed };
}

function trimCache(now: number): void {
  for (const [key, entry] of selectionCache) {
    if (entry.expiresAt <= now) selectionCache.delete(key);
  }
  while (selectionCache.size > MAX_CACHE_ENTRIES) {
    const oldest = selectionCache.keys().next().value;
    if (oldest === undefined) break;
    selectionCache.delete(oldest);
  }
}

function exactObservedPrintingSelection(
  candidates: ScanPrintingCandidate[],
  evidence: ScanPrintingEvidence,
): ScanPrintingSelection | null {
  const identifierMatches = candidates.filter((candidate) => observedIdentifierMatch(candidate, evidence));
  if (identifierMatches.length === 0) return null;
  if (identifierMatches.some((candidate) => !hasNameEvidence(candidate, evidence))) {
    return {
      status: "review",
      recommendedId: null,
      confidence: null,
      message: "The observed set and number match a catalog entry, but its name does not match the scan. Please review the options.",
    };
  }
  return {
    status: "exact",
    recommendedId: identifierMatches[0]!.id,
    confidence: null,
    message: "The observed set, card number, and name match this catalog printing.",
  };
}

export async function evaluateSelection(
  candidates: ScanPrintingCandidate[],
  evidence: ScanPrintingEvidence,
  fetcher: typeof fetch,
): Promise<ScanPrintingSelection> {
  const exactResolution = exactObservedPrintingSelection(candidates, evidence);
  if (exactResolution) return exactResolution;
  if (candidates.length === 0) {
    return {
      status: "review",
      recommendedId: null,
      confidence: null,
      message: "No catalog printing was found. Please review the card details.",
    };
  }
  if (candidates.length > MAX_CANDIDATES) return unavailable();
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return unavailable();

  const candidateOptions = candidates.map((candidate, index) => ({
    key: `printing_${index}`,
    candidate,
    metadata: candidateMetadata(candidate),
  }));
  const noMatchOption = { key: "no_match", description: "None of the supplied printings clearly matches the observed card." };
  const options = [
    ...candidateOptions.map(({ key, metadata }) => ({
      key,
      description: JSON.stringify(metadata),
    })),
    noMatchOption,
  ];
  const state = {
    evidence: normalizedEvidence(evidence),
    candidates: Object.fromEntries(candidateOptions.map(({ key, metadata }) => [key, metadata])),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS);
  try {
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        state,
        questions: { [QUESTION_ID]: questionFor(options) },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return unavailable();
    const payload = await response.json() as JevPayload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
        !payload.answers || typeof payload.answers !== "object" || Array.isArray(payload.answers)) {
      return unavailable();
    }
    const answers = payload.answers as Record<string, unknown>;
    if (Object.keys(answers).length !== 1 || !(QUESTION_ID in answers)) return unavailable();
    const allowedOptions = new Set(options.map(({ key }) => key));
    const answer = validChoiceAnswer(answers[QUESTION_ID], allowedOptions);
    if (!answer) return unavailable();
    if (answer.choice === "no_match") {
      return {
        status: "review",
        recommendedId: null,
        confidence: answer.confidence,
        message: "No printing clearly matched the scan. Please review the options.",
      };
    }

    const chosen = candidateOptions.find(({ key }) => key === answer.choice)?.candidate;
    if (!chosen || contradictsObservedIdentifiers(chosen, evidence)) {
      return {
        status: "review",
        recommendedId: null,
        confidence: answer.confidence,
        message: "The suggested printing conflicts with an observed identifier. Please review the options.",
      };
    }
    if (!hasCatalogIdentifiers(chosen) || !hasNameEvidence(chosen, evidence)) {
      return {
        status: "review",
        recommendedId: null,
        confidence: answer.confidence,
        message: "The catalog details do not clearly identify this printing. Please review the options.",
      };
    }
    const selectedProbability = answer.probabilities[answer.choice]!;
    const runnerUpProbability = Math.max(...Object.entries(answer.probabilities)
      .filter(([key]) => key !== answer.choice)
      .map(([, probability]) => probability));
    if (answer.confidence < MIN_CONFIDENCE ||
        selectedProbability < MIN_SELECTED_PROBABILITY ||
        selectedProbability - runnerUpProbability < MIN_PROBABILITY_MARGIN) {
      return {
        status: "review",
        recommendedId: null,
        confidence: answer.confidence,
        message: "The scan is not clear enough to recommend one printing. Please review the options.",
      };
    }
    return {
      status: "likely",
      recommendedId: chosen.id,
      confidence: answer.confidence,
      message: "This is the most likely printing from the scan. Please check it against the card.",
    };
  } catch {
    return unavailable();
  } finally {
    clearTimeout(timer);
  }
}

export async function selectScanPrinting(
  candidates: ScanPrintingCandidate[],
  evidence: ScanPrintingEvidence,
  fetcher: typeof fetch = fetch,
): Promise<ScanPrintingSelection> {
  const exactResolution = exactObservedPrintingSelection(candidates, evidence);
  if (exactResolution) return exactResolution;
  if (candidates.length === 0) {
    return {
      status: "review",
      recommendedId: null,
      confidence: null,
      message: "No catalog printing was found. Please review the card details.",
    };
  }
  const key = evidenceHash(candidates, evidence);
  const now = Date.now();
  trimCache(now);
  const cached = selectionCache.get(key);
  if (cached) {
    selectionCache.delete(key);
    selectionCache.set(key, cached);
    return cached.value;
  }
  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = evaluateSelection(candidates, evidence, fetcher);
  inFlight.set(key, pending);
  try {
    const result = await pending;
    if (result.status === "likely" || result.status === "review") {
      // Only cache valid provider judgments; unavailable failures must be retried.
      // Empty-candidate and exact results return before this cache path.
      selectionCache.set(key, { value: result, expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS });
      trimCache(Date.now());
    }
    return result;
  } finally {
    inFlight.delete(key);
  }
}

export const scanPrintingSelectionLimits = {
  maxCandidates: MAX_CANDIDATES,
  timeoutMs: JEV_TIMEOUT_MS,
};