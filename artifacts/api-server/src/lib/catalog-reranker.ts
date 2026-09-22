import type { NormalizedCatalogCard } from "./pokewallet.js";

const MODEL = "jev-latest";
const JEV_BUDGET_MS = 180;

export function isAmbiguousNaturalLanguage(query: string): boolean {
  const q = query.trim();
  if (!q || /^[a-z0-9]+-\d+$/i.test(q) || /\b[a-z]{2,}\d*\s*#?\d+(?:\/\d+)?\b/i.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length >= 3 && (words.some((word) => word.length > 5) || /(?:from|with|that|looks|type|era|old|new)/i.test(q));
}

type JevAnswer = { type?: string; noul?: number };
type JevResponse = { answers?: Record<string, JevAnswer> };

export async function rerankCatalogCandidates(
  query: string,
  candidates: NormalizedCatalogCard[],
  fetcher: typeof fetch = fetch,
): Promise<{ results: NormalizedCatalogCard[]; status: "invoked" | "fallback" | "skipped" }> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || !isAmbiguousNaturalLanguage(query) || candidates.length < 2) {
    return { results: candidates, status: "skipped" };
  }
  const shortlist = candidates.slice(0, 8);
  const questions = Object.fromEntries(shortlist.map((candidate, index) => [
    `candidate_${index}`,
    {
      type: "noul",
      instructions: `Is candidate ${index} semantically relevant to the user's card search?`,
      criteria: {
        true: "The candidate satisfies the described Pokémon, set, era, type, or printing intent.",
        false: "The candidate only shares incidental words or conflicts with the described intent.",
      },
    },
  ]));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JEV_BUDGET_MS);
  try {
    const response = await fetcher("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        state: {
          query,
          candidates: shortlist.map(({ id, name, pokemonName, setName, setCode, cardNumber, rarity }) =>
            ({ id, name, pokemonName, setName, setCode, cardNumber, rarity })),
        },
        questions,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    const raw = await response.json() as JevResponse;
    if (!raw.answers) throw new Error("Invalid TypeSafe response");
    const scores = new Map(shortlist.map((card, index) => [card.id, raw.answers?.[`candidate_${index}`]?.noul ?? -1]));
    const reranked = [...shortlist].sort((a, b) => (scores.get(b.id) ?? -1) - (scores.get(a.id) ?? -1));
    return { results: [...reranked, ...candidates.slice(shortlist.length)], status: "invoked" };
  } catch {
    return { results: candidates, status: "fallback" };
  } finally {
    clearTimeout(timer);
  }
}
