const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const PTCGIO_BASE = "https://api.pokemontcg.io/v2";

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "ex", "v", "gx", "vmax", "vstar"]);

// PSA grade multipliers relative to raw market price
const PSA_MULTIPLIERS: Record<number, number> = {
  10: 5.0,
  9:  2.0,
  8:  1.3,
  7:  0.9,
  6:  0.7,
  5:  0.5,
};

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface SetBrief {
  id: string;
  name: string;
}

interface PtcgCard {
  id: string;
  name: string;
  tcgplayer?: { prices?: Record<string, { market?: number; mid?: number; low?: number; high?: number }> };
  cardmarket?: { prices?: { trendPrice?: number; averageSellPrice?: number; lowPrice?: number; avg30?: number } };
}

async function fetchSetName(setId: string): Promise<string> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
    if (!res.ok) return setId;
    const data = (await res.json()) as SetBrief;
    return data.name ?? setId;
  } catch {
    return setId;
  }
}

async function fetchCards(namePattern: string): Promise<CardBrief[]> {
  try {
    // Encode only the text segments, leaving * wildcards unencoded
    const encoded = namePattern.split("*").map(encodeURIComponent).join("*");
    const res = await fetch(`${TCGDEX_BASE}/cards?name=${encoded}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export interface PricingData {
  marketPrice: number | null;
  lowPrice: number | null;
  trendPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  psaEstimates: Record<number, number> | null;
  isFallback?: boolean;
}

function extractPricing(card: PtcgCard): PricingData {
  const empty: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  if (!card) return empty;
  const tcgPrices = card.tcgplayer?.prices ?? {};
  const tcgVariants = Object.values(tcgPrices);
  const tcgMarket = tcgVariants.find((v) => v.market != null)?.market ?? null;
  const tcgLow = tcgVariants.find((v) => v.low != null)?.low ?? null;
  const cm = card.cardmarket?.prices;
  const cmMarket = cm?.trendPrice ?? cm?.averageSellPrice ?? null;
  const cmLow = cm?.lowPrice ?? null;
  const marketPrice = tcgMarket ?? cmMarket;
  const lowPrice = tcgLow ?? cmLow;
  const trendPrice = cm?.trendPrice ?? null;
  const source: PricingData["source"] = tcgMarket != null ? "tcgplayer" : cmMarket != null ? "cardmarket" : null;
  const psaEstimates = marketPrice != null
    ? Object.fromEntries(
        Object.entries(PSA_MULTIPLIERS).map(([grade, mult]) => [
          Number(grade),
          Math.round(marketPrice * mult * 100) / 100,
        ]),
      )
    : null;
  return { marketPrice, lowPrice, trendPrice, source, psaEstimates };
}

async function fetchPricing(cardName: string, rarity?: string): Promise<PricingData> {
  const empty: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };

  async function query(qStr: string): Promise<PricingData> {
    const res = await fetch(
      `${PTCGIO_BASE}/cards?q=${encodeURIComponent(qStr)}&select=id,name,tcgplayer,cardmarket&pageSize=5`,
    );
    if (!res.ok) return empty;
    const data = (await res.json()) as { data: PtcgCard[] };
    const cards = data.data ?? [];
    if (cards.length === 0) return empty;
    const nameLower = cardName.toLowerCase();
    const match = cards.find((c) => c.name.toLowerCase() === nameLower) ?? cards[0];
    return extractPricing(match);
  }

  try {
    // If we have a rarity hint, try rarity-scoped search first for a closer price match
    if (rarity) {
      const p = await query(`name:"${cardName}" rarity:${rarity}`);
      if (p.marketPrice != null || p.lowPrice != null) return p;
    }
    return await query(`name:"${cardName}"`);
  } catch {
    return empty;
  }
}

/**
 * Fetch pricing for a specific printing using its TCGdex card ID (e.g. "xy8-024").
 * Converts to PTCG.io format by stripping leading zeros from the number segment.
 */
export async function fetchPricingById(tcgdexId: string, fallbackName?: string, fallbackRarity?: string): Promise<PricingData> {
  const empty: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  try {
    const dashIdx = tcgdexId.lastIndexOf("-");
    if (dashIdx === -1) return empty;
    const setId = tcgdexId.slice(0, dashIdx);
    const rawNum = tcgdexId.slice(dashIdx + 1);
    // Strip leading zeros from card number (e.g. "028" → "28")
    const strippedNum = String(parseInt(rawNum, 10));
    // Also strip leading zeros from the numeric suffix of the set prefix
    // e.g. TCGdex uses "me03" but PTCG.io uses "me3"
    const setIdNorm = setId.replace(/([a-z]+)0+(\d)/i, "$1$2");
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const sid of [setIdNorm, setId]) {
      for (const num of strippedNum === "NaN" ? [rawNum] : [strippedNum, rawNum]) {
        const id = `${sid}-${num}`;
        if (!seen.has(id)) { seen.add(id); candidates.push(id); }
      }
    }
    for (const id of candidates) {
      const res = await fetch(`${PTCGIO_BASE}/cards/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { data: PtcgCard };
        const pricing = extractPricing(data.data);
        if (pricing.marketPrice != null || pricing.lowPrice != null) return pricing;
      }
    }
    // No prices found for this specific printing — fall back to name+rarity search
    if (fallbackName) {
      const namePricing = await fetchPricing(fallbackName, fallbackRarity);
      if (namePricing.marketPrice != null || namePricing.lowPrice != null) {
        return { ...namePricing, isFallback: true };
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

export interface TcgResult {
  id: string;
  name: string;
  imageUrl: string;
  setName: string;
  setId: string;
  cardNumber: string;
  rarity: null;
}

async function buildResults(cards: CardBrief[]): Promise<TcgResult[]> {
  // Filter out "tk" promo token cards — they have no images and aren't real printings
  const filtered = cards.filter((c) => !c.id.startsWith("tk")).slice(0, 20);
  const setIds = [...new Set(filtered.map((c) => c.id.split("-")[0]).filter(Boolean))] as string[];
  const setMap: Record<string, string> = {};
  await Promise.all(setIds.map(async (id) => { setMap[id] = await fetchSetName(id); }));
  return filtered.map((card) => {
    const setId = card.id.split("-")[0] ?? "";
    return {
      id: card.id,
      name: card.name,
      imageUrl: card.image ? `${card.image}/high.png` : "",
      setName: setMap[setId] ?? setId,
      setId,
      cardNumber: card.localId ?? card.id.split("-")[1] ?? "",
      rarity: null,
    };
  });
}

export async function searchTcgdex(query: string): Promise<{ variants: TcgResult[]; pricing: PricingData }> {
  const emptyPricing: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  try {
    // Strategy 1: exact wildcard on the full query
    let cards = await fetchCards(`*${query}*`);

    // Strategy 2: per-word fallback if full phrase gives nothing
    if (cards.filter((c) => !c.id.startsWith("tk")).length === 0) {
      const words = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

      if (words.length > 0) {
        const perWord = await Promise.all(words.map((w) => fetchCards(`*${w}*`)));
        const seen = new Set<string>();
        const merged: CardBrief[] = [];
        for (const batch of perWord) {
          for (const card of batch) {
            if (!seen.has(card.id)) { seen.add(card.id); merged.push(card); }
          }
        }
        const queryWords = new Set(words);
        merged.sort((a, b) => {
          const scoreA = a.name.toLowerCase().split(/\s+/).filter((w) => queryWords.has(w)).length;
          const scoreB = b.name.toLowerCase().split(/\s+/).filter((w) => queryWords.has(w)).length;
          return scoreB - scoreA;
        });
        cards = merged;
      }
    }

    // Best match = first non-tk card by name similarity
    const bestMatch = cards.find((c) => !c.id.startsWith("tk"));
    const bestName = bestMatch?.name ?? query;

    // For per-word fallback: filter merged results to cards actually related to the best match
    // (prevents generic "Grass Energy", "Water Energy" etc flooding when searching "Telepathic Energy")
    const bestWords = bestName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    // Require cards to contain the MOST DISTINCTIVE word (first significant word of best match).
    // e.g. "Telepathic Psychic Energy" → anchor = "telepathic", so "Grass Energy" is excluded.
    const anchorWord = bestWords[0];
    const filteredCards = anchorWord
      ? cards.filter((c) => c.name.toLowerCase().includes(anchorWord))
      : cards;

    // Fetch variants + pricing in parallel
    const [variants, pricing] = await Promise.all([
      buildResults(filteredCards),
      fetchPricing(bestName),
    ]);

    return { variants, pricing };
  } catch {
    return { variants: [], pricing: emptyPricing };
  }
}
