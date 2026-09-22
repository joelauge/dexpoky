export const DECK_SCORE_DIMENSIONS = [
  "synergy",
  "roleCoverage",
  "energyConsistency",
  "reliability",
  "playStyleFit",
  "purchaseValue",
] as const;

export type DeckScoreDimension = (typeof DECK_SCORE_DIMENSIONS)[number];
export type DeckStrategicScores = Record<DeckScoreDimension, number>;

export interface DeckRankCandidate {
  key: string;
  source: "owned" | "wishlist" | "catalog" | "shopping";
  name: string;
  count: number;
  role: string | null;
  reason: string;
  originalIndex: number;
}

export interface RankedDeckCandidate {
  key: string;
  scores: DeckStrategicScores;
  confidence: number;
  uncertain: boolean;
  overall: number;
}

interface ScoreAnswer {
  type?: unknown;
  score?: unknown;
  confidence?: unknown;
}

const scorePrompts: Record<DeckScoreDimension, string> = {
  synergy: "How strongly does this card combine with the other legal candidates and their stated roles?",
  roleCoverage: "How well does this card fill a necessary deck role without adding harmful redundancy?",
  energyConsistency: "How compatible is this card with a reliable one- or two-type Energy plan? Trainer and Colorless flexibility count positively.",
  reliability: "How consistently useful is this card across normal draws and game states, rather than only in a fragile best case?",
  playStyleFit: "How well does this card fit the requested play style and player notes?",
  purchaseValue: "If this card is not owned, how valuable is acquiring it relative to substitutes? Owned cards should be treated as already available, not purchases.",
};

function neutral(candidate: DeckRankCandidate): RankedDeckCandidate {
  return {
    key: candidate.key,
    scores: Object.fromEntries(DECK_SCORE_DIMENSIONS.map((dimension) => [dimension, .5])) as DeckStrategicScores,
    confidence: 0,
    uncertain: true,
    overall: .5,
  };
}

function parseBatchAnswers(
  candidates: DeckRankCandidate[],
  value: unknown,
): Map<string, RankedDeckCandidate> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const answers = value as Record<string, ScoreAnswer>;
  const result = new Map<string, RankedDeckCandidate>();
  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index];
    const scores = {} as DeckStrategicScores;
    const confidences: number[] = [];
    for (const dimension of DECK_SCORE_DIMENSIONS) {
      const answer = answers[`c${index}_${dimension}`];
      if (
        !answer ||
        typeof answer.score !== "number" ||
        !Number.isFinite(answer.score) ||
        answer.score < 0 ||
        answer.score > 2 ||
        typeof answer.confidence !== "number" ||
        !Number.isFinite(answer.confidence) ||
        answer.confidence < 0 ||
        answer.confidence > 1
      ) return null;
      scores[dimension] = answer.score / 2;
      confidences.push(answer.confidence);
    }
    const confidence = Math.min(...confidences);
    const strategic =
      scores.synergy * .24 +
      scores.roleCoverage * .18 +
      scores.energyConsistency * .16 +
      scores.reliability * .16 +
      scores.playStyleFit * .20 +
      scores.purchaseValue * .06;
    const ownedPriority = candidate.source === "owned" ? .12 : candidate.source === "wishlist" ? .03 : 0;
    result.set(candidate.key, {
      key: candidate.key,
      scores,
      confidence,
      uncertain: confidence < .55,
      overall: Math.min(1, strategic + ownedPriority),
    });
  }
  return result;
}

async function rankBatch(
  candidates: DeckRankCandidate[],
  gameStyle: string,
  notes: string | null | undefined,
): Promise<Map<string, RankedDeckCandidate> | null> {
  const state = {
    requestedPlayStyle: gameStyle,
    playerNotes: notes || null,
    legalCandidates: candidates.map(({ key, originalIndex: _index, ...candidate }) => ({ key, ...candidate })),
  };
  const questions: Record<string, unknown> = {};
  candidates.forEach((candidate, index) => {
    for (const dimension of DECK_SCORE_DIMENSIONS) {
      questions[`c${index}_${dimension}`] = {
        type: "score",
        instructions: {
          question: scorePrompts[dimension],
          candidate: {
            key: candidate.key,
            source: candidate.source,
            name: candidate.name,
            count: candidate.count,
            role: candidate.role,
            reason: candidate.reason,
          },
          constraint: "Score only strategic usefulness. Do not decide legality, change counts, promise wins, or assume unavailable card text.",
        },
        criteria: [
          "Poor fit or unsupported by the supplied candidate state.",
          "Usable but replaceable, conditional, or only partly supported.",
          "Strong, clearly supported fit for this legal candidate pool and requested style.",
        ],
      };
    }
  });

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
    return parseBatchAnswers(candidates, payload.answers);
  } catch {
    return null;
  }
}

export async function rankLegalDeckCandidates(
  candidates: DeckRankCandidate[],
  gameStyle: string,
  notes?: string | null,
): Promise<{ rankings: Map<string, RankedDeckCandidate>; unavailable: boolean }> {
  const fallback = new Map(candidates.map((candidate) => [candidate.key, neutral(candidate)]));
  if (!process.env.TYPESAFE_API_KEY || candidates.length === 0) {
    return { rankings: fallback, unavailable: true };
  }

  const batches: DeckRankCandidate[][] = [];
  for (let index = 0; index < candidates.length; index += 8) batches.push(candidates.slice(index, index + 8));
  const outputs = await Promise.all(batches.map((batch) => rankBatch(batch, gameStyle, notes)));
  if (outputs.some((output) => output == null)) return { rankings: fallback, unavailable: true };
  const rankings = new Map<string, RankedDeckCandidate>();
  for (const output of outputs) for (const [key, ranking] of output!) rankings.set(key, ranking);
  return { rankings, unavailable: false };
}

const BASIC_ENERGY_NAMES = new Set(
  ["grass", "fire", "water", "lightning", "psychic", "fighting", "darkness", "metal", "fairy"]
    .flatMap((type) => [`${type} energy`, `basic ${type} energy`]),
);

export function enforceLegalCandidateLimits<T extends { name: string; count: number; rarity?: string | null }>(candidates: T[]): T[] {
  const usedByName = new Map<string, number>();
  let total = 0;
  let radiantUsed = 0;
  let aceSpecUsed = 0;
  const legal: T[] = [];
  for (const candidate of candidates) {
    if (!candidate.name.trim() || !Number.isFinite(candidate.count)) continue;
    const nameKey = candidate.name.trim().toLowerCase();
    const isBasicEnergy = BASIC_ENERGY_NAMES.has(nameKey);
    const isRadiant = /^radiant\s+/i.test(candidate.name);
    const rarity = candidate.rarity?.trim().toLowerCase() ?? "";
    const isAceSpec = /\bace spec\b/i.test(candidate.name) || /\bace spec\b/i.test(rarity);
    const isPrismStar = /\bprism star\b/i.test(candidate.name) || candidate.name.includes("◇") || /\bprism star\b/i.test(rarity);
    const nameRemaining = isBasicEnergy ? 60 : Math.max(0, 4 - (usedByName.get(nameKey) ?? 0));
    const specialRemaining = isRadiant
      ? Math.max(0, 1 - radiantUsed)
      : isAceSpec
        ? Math.max(0, 1 - aceSpecUsed)
        : isPrismStar
          ? Math.max(0, 1 - (usedByName.get(nameKey) ?? 0))
          : 60;
    const count = Math.min(Math.max(1, Math.floor(candidate.count)), nameRemaining, specialRemaining, 60 - total);
    if (count <= 0) continue;
    legal.push({ ...candidate, count });
    usedByName.set(nameKey, (usedByName.get(nameKey) ?? 0) + count);
    total += count;
    if (isRadiant) radiantUsed += count;
    if (isAceSpec) aceSpecUsed += count;
    if (total >= 60) break;
  }
  return legal;
}