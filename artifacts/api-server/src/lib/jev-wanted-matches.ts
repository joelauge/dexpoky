export interface WantedIntent {
  catalogCardId: string;
  name: string;
  pokemonName: string;
  setName: string | null;
  cardNumber: string | null;
  maxPrice: number | null;
  preferences: string | null;
}

export interface WantedCandidate {
  listingId: number;
  cardId: number;
  catalogCardId: string | null;
  name: string;
  pokemonName: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string;
  condition: string;
  price: number;
  description: string | null;
}

export interface RankedWantedMatch extends WantedCandidate {
  exactPrinting: boolean;
  relevance: number;
  confidence: number;
  label: "Strong match" | "Possible match" | "Near match";
  explanation: string;
}

interface JevAnswer {
  score?: number;
  confidence?: number;
  probabilities?: Record<string, number>;
}

function deterministicScore(intent: WantedIntent, candidate: WantedCandidate): number {
  if (candidate.catalogCardId === intent.catalogCardId) return 1;
  const sameSet = intent.setName && candidate.setName?.toLowerCase() === intent.setName.toLowerCase();
  return sameSet ? .55 : .35;
}

export function isWantedCandidateEligible(intent: WantedIntent, candidate: WantedCandidate): boolean {
  if (candidate.pokemonName.trim().toLowerCase() !== intent.pokemonName.trim().toLowerCase()) return false;
  if (intent.maxPrice != null && candidate.price > intent.maxPrice) return false;
  return true;
}

function explain(match: Pick<RankedWantedMatch, "exactPrinting" | "relevance" | "confidence">): Pick<RankedWantedMatch, "label" | "explanation"> {
  if (match.confidence < .6) {
    return { label: "Near match", explanation: "This is eligible, but DexPoky is not confident it fits the details in your request." };
  }
  if (match.exactPrinting && match.relevance >= .67) {
    return { label: "Strong match", explanation: "This exact printing fits the known requirements and your stated preferences." };
  }
  if (match.relevance >= .67) {
    return { label: "Possible match", explanation: "This eligible printing appears to fit your stated preferences." };
  }
  return { label: "Near match", explanation: "This eligible printing is related, but some preferences may not match." };
}

export function deterministicWantedMatches(intent: WantedIntent, candidates: WantedCandidate[]): RankedWantedMatch[] {
  return candidates.filter((candidate) =>
    isWantedCandidateEligible(intent, candidate) &&
    candidate.catalogCardId === intent.catalogCardId
  ).map((candidate) => {
    const exactPrinting = candidate.catalogCardId === intent.catalogCardId;
    const relevance = deterministicScore(intent, candidate);
    const base = { ...candidate, exactPrinting, relevance, confidence: 1 };
    return { ...base, ...explain(base) };
  }).sort((a, b) => b.relevance - a.relevance || a.price - b.price || a.listingId - b.listingId);
}

function unavailableSemanticMatches(intent: WantedIntent, candidates: WantedCandidate[]): RankedWantedMatch[] {
  return candidates.filter((candidate) => isWantedCandidateEligible(intent, candidate)).map((candidate) => {
    const exactPrinting = candidate.catalogCardId === intent.catalogCardId;
    return {
      ...candidate,
      exactPrinting,
      relevance: deterministicScore(intent, candidate),
      confidence: 0,
      label: "Near match" as const,
      explanation: "This listing is eligible, but DexPoky could not evaluate your stated preferences yet.",
    };
  }).sort((a, b) => Number(b.exactPrinting) - Number(a.exactPrinting) || a.price - b.price);
}

function validAnswers(value: unknown, ids: string[]): value is Record<string, Required<Pick<JevAnswer, "score" | "confidence">> & JevAnswer> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const answers = value as Record<string, unknown>;
  if (Object.keys(answers).length !== ids.length || ids.some((id) => !(id in answers))) return false;
  return ids.every((id) => {
    const answer = answers[id];
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) return false;
    const row = answer as Record<string, unknown>;
    if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0 || row.score > 2) return false;
    if (typeof row.confidence !== "number" || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1) return false;
    if (row.probabilities !== undefined) {
      if (!row.probabilities || typeof row.probabilities !== "object" || Array.isArray(row.probabilities)) return false;
      if (Object.values(row.probabilities as Record<string, unknown>).some((p) => typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1)) return false;
    }
    return true;
  });
}

export async function rerankWantedMatches(intent: WantedIntent, candidates: WantedCandidate[]): Promise<RankedWantedMatch[]> {
  const eligible = candidates.filter((candidate) => isWantedCandidateEligible(intent, candidate));
  const fallback = deterministicWantedMatches(intent, eligible);
  if (!intent.preferences?.trim() || eligible.length === 0) return fallback;
  const unavailable = unavailableSemanticMatches(intent, eligible);
  if (!process.env.TYPESAFE_API_KEY) return unavailable;

  const questions = Object.fromEntries(eligible.map((candidate) => [
    `listing_${candidate.listingId}`,
    {
      type: "score",
      instructions: `How well does \`candidates.listing_${candidate.listingId}\` satisfy the buyer's natural-language preferences in \`intent.preferences\`? Judge only preference fit; do not override identity, ownership, visibility, or budget eligibility.`,
      criteria: {
        0: "Clearly conflicts with an important stated preference.",
        1: "Partly fits, or the available evidence is ambiguous.",
        2: "Clearly fits the stated preferences.",
      },
    },
  ]));
  const candidateState = Object.fromEntries(eligible.map((candidate) => [`listing_${candidate.listingId}`, candidate]));

  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "jev-latest", state: { intent, candidates: candidateState }, questions }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return unavailable;
    const payload = await response.json() as { answers?: unknown };
    const ids = eligible.map((candidate) => `listing_${candidate.listingId}`);
    const answers = payload.answers;
    if (!validAnswers(answers, ids)) return unavailable;

    return eligible.map((candidate) => {
      const answer = answers[`listing_${candidate.listingId}`];
      const exactPrinting = candidate.catalogCardId === intent.catalogCardId;
      const relevance = answer.score / 2;
      const confidence = answer.confidence;
      const base = { ...candidate, exactPrinting, relevance, confidence };
      return { ...base, ...explain(base) };
    }).sort((a, b) =>
      Number(b.label === "Strong match") - Number(a.label === "Strong match") ||
      b.relevance - a.relevance ||
      b.confidence - a.confidence ||
      a.price - b.price
    );
  } catch {
    return unavailable;
  }
}

export function shouldSendUrgentWantedNotification(match: RankedWantedMatch, hasSemanticPreferences: boolean): boolean {
  return !hasSemanticPreferences || (match.relevance >= .67 && match.confidence >= .7);
}