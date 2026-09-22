import { createHash } from "node:crypto";

export type RecommendationProfile = "collector" | "player" | "seller" | "trader" | "investor";
export type RecommendationAction = "keep" | "play" | "sell" | "trade" | "grade" | "watch";
export const recommendationActions: RecommendationAction[] = ["keep", "play", "sell", "trade", "grade", "watch"];

export interface OwnedCardRecommendationInput {
  card: { id: number; name: string; catalogCardId: string | null; estimatedValue: number | null; listingPrice: number | null; condition: string; forSale: boolean; imageUrl: string | null; };
  duplicateCount: number; deckUses: number; wishlistMatch: boolean; evidenceAt?: Date | string | null;
}
export interface RawJudgment { action: RecommendationAction; score: number; confidence: number; probabilities: Record<string, number>; }
type JevAnswer = { type?: string; score?: number; confidence?: number; probabilities?: Record<string, number> };
type JevResponse = { model?: string; answers?: Record<string, JevAnswer> };
const MODEL = "jev-latest";
type RawResult = { judgments: RawJudgment[]; model: string; unavailable: boolean };
type CacheEntry = { result: RawResult; expiresAt: number };
const SUCCESS_TTL_MS = 30 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;
const MAX_CACHE_ENTRIES = 500;
const USER_BUDGET_WINDOW_MS = 5 * 60 * 1000;
const MAX_USER_COLD_CALLS = 10;
export const MIN_RECOMMENDATION_CONFIDENCE = 0.6;
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RawResult>>();
const userColdCalls = new Map<string, number[]>();

const weights: Record<RecommendationProfile, Partial<Record<RecommendationAction, number>>> = {
  collector: { keep: 1.2, grade: 1.1, watch: .8, sell: -.8 }, player: { play: 1.3, keep: .7, trade: .5, grade: -.3 },
  seller: { sell: 1.4, grade: .5, watch: -.2, keep: -.4 }, trader: { trade: 1.4, sell: .7, watch: .3, keep: -.3 },
  investor: { watch: 1.2, grade: 1.1, keep: .9, sell: .3 },
};
const hash = (input: OwnedCardRecommendationInput) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const num = (v: unknown): number | null => typeof v === "number" && Number.isFinite(v) ? v : null;

function validate(raw: unknown): raw is JevResponse {
  if (!raw || typeof raw !== "object" || !("answers" in raw)) return false;
  const response = raw as JevResponse;
  if (response.model != null && typeof response.model !== "string") return false;
  const answers = response.answers;
  return !!answers && recommendationActions.every((action) => {
    const answer = answers[action];
    const score = num(answer?.score);
    const confidence = num(answer?.confidence);
    if (answer?.type !== "score" || score == null || score < 0 || score > 2) return false;
    if (confidence == null || confidence < 0 || confidence > 1) return false;
    if (!answer.probabilities || typeof answer.probabilities !== "object") return false;
    return ["0", "1", "2"].every((level) => {
      const probability = num(answer.probabilities?.[level]);
      return probability != null && probability >= 0 && probability <= 1;
    });
  });
}
function deterministic(input: OwnedCardRecommendationInput, action: RecommendationAction): number {
  const value = input.card.estimatedValue ?? 0;
  return ({ keep: input.duplicateCount === 1 ? .75 : .3, play: input.deckUses ? .9 : .15, sell: input.duplicateCount > 1 ? .8 : .2, trade: input.duplicateCount > 1 ? .7 : .25, grade: value >= 100 && ["mint", "near_mint"].includes(input.card.condition) ? .8 : .1, watch: value > 0 ? .45 : .15 })[action];
}

function dexPokyReason(action: RecommendationAction, input: OwnedCardRecommendationInput): string {
  const value = input.card.estimatedValue;
  switch (action) {
    case "keep":
      return input.duplicateCount === 1
        ? "This is your only copy, so you may want to keep it"
        : "You have an extra copy, so keeping every copy may be less important";
    case "play":
      return input.deckUses > 0
        ? "You already use this card in a deck"
        : "This card is not in one of your decks yet";
    case "sell":
      if (input.card.forSale) return "This card is already marked for sale";
      return input.duplicateCount > 1
        ? "You could sell an extra copy and still keep one"
        : "Selling this card would leave you without a copy";
    case "trade":
      return input.duplicateCount > 1
        ? "An extra copy may be easier to trade"
        : "Trading this card would leave you without a copy";
    case "grade":
      if (["mint", "near_mint"].includes(input.card.condition) && value != null) {
        return "Its condition and value may make expert grading worth checking";
      }
      return "Its condition or value may not make grading useful right now";
    case "watch":
      return value != null
        ? "DexPoky can track this card's value from its current price"
        : "DexPoky needs better price information before tracking changes";
  }
}
function consumeUserBudget(userId?: string): boolean {
  if (!userId) return true;
  const cutoff = Date.now() - USER_BUDGET_WINDOW_MS;
  const recent = (userColdCalls.get(userId) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= MAX_USER_COLD_CALLS) {
    userColdCalls.set(userId, recent);
    return false;
  }
  recent.push(Date.now());
  userColdCalls.set(userId, recent);
  return true;
}

async function rawJudgments(input: OwnedCardRecommendationInput, evidenceHash: string, userId?: string) {
  const cacheKey = `${MODEL}:${evidenceHash}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    cache.delete(cacheKey);
    cache.set(cacheKey, cached);
    return cached.result;
  }
  if (cached) cache.delete(cacheKey);
  const existing = inFlight.get(cacheKey);
  if (existing) return existing;
  const work = (async () => {
    const fallback = (): RawResult => ({ judgments: recommendationActions.map((action) => ({ action, score: deterministic(input, action), confidence: .35, probabilities: {} })), model: MODEL, unavailable: true });
    const key = process.env.TYPESAFE_API_KEY; if (!key) return fallback();
    if (!consumeUserBudget(userId)) return fallback();
    const questions = Object.fromEntries(recommendationActions.map((action) => [action, { type: "score", instructions: `How appropriate is the informational action ${action} for this owned card, using only the supplied evidence?`, criteria: ["not appropriate", "uncertain", "strongly appropriate"] }]));
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch("https://api.typesafe.ai/v1/systemone", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: MODEL, state: input, questions }), signal: controller.signal });
      if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
      const raw = await response.json() as unknown; if (!validate(raw)) throw new Error("Invalid TypeSafe response");
      const answers = (raw as JevResponse).answers!;
      return { model: (raw as JevResponse).model ?? MODEL, unavailable: false, judgments: recommendationActions.map((action) => { const a = answers[action]; return { action, score: clamp((a.score ?? 0) / 2), confidence: clamp(a.confidence ?? 0), probabilities: a.probabilities ?? {} }; }) };
    } catch { return fallback(); } finally { clearTimeout(timer); }
  })();
  inFlight.set(cacheKey, work);
  try {
    const result = await work;
    cache.set(cacheKey, {
      result,
      expiresAt: Date.now() + (result.unavailable ? FAILURE_TTL_MS : SUCCESS_TTL_MS),
    });
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest == null) break;
      cache.delete(oldest);
    }
    return result;
  } finally {
    inFlight.delete(cacheKey);
  }
}
export function recommendationKey(cardId: number, action: RecommendationAction) { return `card:${cardId}:${action}`; }
export async function recommendCard(input: OwnedCardRecommendationInput, profile: RecommendationProfile, userId?: string) {
  const evidenceHash = hash(input); const raw = await rawJudgments(input, evidenceHash, userId);
  const recommendations = raw.judgments.filter((judgment) => judgment.confidence >= MIN_RECOMMENDATION_CONFIDENCE).map((judgment) => {
    const score = clamp(judgment.score + (weights[profile][judgment.action] ?? 0) * .12);
    return { key: recommendationKey(input.card.id, judgment.action), action: judgment.action, score: Math.round(score * 100) / 100, confidence: judgment.confidence, probabilities: judgment.probabilities, reasons: [input.duplicateCount > 1 ? `You own ${input.duplicateCount} copies` : null, input.deckUses ? `You use it in ${input.deckUses} deck${input.deckUses === 1 ? "" : "s"}` : null, input.wishlistMatch ? "It matches a card on your wish list" : null, dexPokyReason(judgment.action, input)].filter(Boolean), informational: true, unavailable: raw.unavailable, evidenceHash };
  }).sort((a, b) => (b.score * b.confidence) - (a.score * a.confidence));
  return { card: input.card, profile, recommendations, informational: true, evidenceHash, unavailable: raw.unavailable };
}