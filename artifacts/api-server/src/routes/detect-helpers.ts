const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const PTCGIO_BASE = "https://api.pokemontcg.io/v2";
const PTCGIO_TCGPLAYER_BASE = "https://prices.pokemontcg.io/tcgplayer";
const MPAPI_BASE = "https://mpapi.tcgplayer.com/v2/product";

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

interface TcgPlayerPricePoint {
  printingType: string;
  marketPrice: number | null;
  buylistMarketPrice: number | null;
  listedMedianPrice: number | null;
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

function buildPsaEstimates(marketPrice: number | null): Record<number, number> | null {
  if (marketPrice == null) return null;
  return Object.fromEntries(
    Object.entries(PSA_MULTIPLIERS).map(([grade, mult]) => [
      Number(grade),
      Math.round(marketPrice * mult * 100) / 100,
    ]),
  );
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
  return { marketPrice, lowPrice, trendPrice, source, psaEstimates: buildPsaEstimates(marketPrice) };
}

/**
 * Resolve a PTCG.io card ID to a TCGPlayer product ID by following the PTCG.io redirect.
 * Returns null if the product ID cannot be determined.
 *
 * The redirect chain:
 *   https://prices.pokemontcg.io/tcgplayer/{ptcgioId}
 *   → https://tcgplayer.pxf.io/scrydex?u=https://tcgplayer.com/product/{productId}
 *
 * We grab the product ID from the `u=` query param in the first Location header.
 */
async function resolveTCGPlayerProductId(ptcgioId: string): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${PTCGIO_TCGPLAYER_BASE}/${ptcgioId}`, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status !== 302 && res.status !== 301) return null;
    const location = res.headers.get("location") ?? "";
    // Location looks like: https://tcgplayer.pxf.io/scrydex?u=https://tcgplayer.com/product/684398
    const match = location.match(/tcgplayer\.com\/product\/(\d+)/i);
    if (!match) return null;
    return parseInt(match[1], 10);
  } catch {
    return null;
  }
}

/**
 * Fetch pricing directly from TCGPlayer's internal marketplace API using a product ID.
 * Returns null if the product has no price data.
 */
async function fetchTCGPlayerPricePoints(productId: number): Promise<PricingData | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${MPAPI_BASE}/${productId}/pricepoints`, {
      headers: {
        "Origin": "https://www.tcgplayer.com",
        "Referer": "https://www.tcgplayer.com/",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const points = (await res.json()) as TcgPlayerPricePoint[];
    if (!Array.isArray(points) || points.length === 0) return null;

    const normal = points.find((p) => p.printingType === "Normal");
    const foil = points.find((p) => p.printingType === "Foil");

    // Pick best available market price: Normal first, then Foil, then any variant
    const marketPrice =
      normal?.marketPrice ??
      foil?.marketPrice ??
      points.find((p) => p.marketPrice != null)?.marketPrice ??
      null;

    // Pick best available low/median price from the same priority
    const lowPrice =
      normal?.listedMedianPrice ??
      foil?.listedMedianPrice ??
      points.find((p) => p.listedMedianPrice != null)?.listedMedianPrice ??
      null;

    if (marketPrice == null && lowPrice == null) return null;

    return {
      marketPrice,
      lowPrice,
      trendPrice: null,
      source: "tcgplayer",
      psaEstimates: buildPsaEstimates(marketPrice),
    };
  } catch {
    return null;
  }
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
 * Fetch pricing for a specific printing using its TCGdex card ID (e.g. "me03-028").
 *
 * Priority:
 *  1. TCGPlayer direct via PTCG.io redirect → mpapi.tcgplayer.com pricepoints (most accurate)
 *  2. PTCG.io inline tcgplayer/cardmarket prices (works for many older sets)
 *  3. Fallback name+rarity search (returns isFallback: true)
 */
export async function fetchPricingById(tcgdexId: string, fallbackName?: string, fallbackRarity?: string): Promise<PricingData> {
  const empty: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  try {
    const dashIdx = tcgdexId.lastIndexOf("-");
    if (dashIdx === -1) return empty;
    const setId = tcgdexId.slice(0, dashIdx);
    const rawNum = tcgdexId.slice(dashIdx + 1);
    const strippedNum = String(parseInt(rawNum, 10));
    // Strip leading zeros from set prefix: "me03" → "me3"
    const setIdNorm = setId.replace(/([a-z]+)0+(\d)/i, "$1$2");

    // Build PTCG.io candidate IDs (normalized first, then raw)
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const sid of [setIdNorm, setId]) {
      for (const num of strippedNum === "NaN" ? [rawNum] : [strippedNum, rawNum]) {
        const id = `${sid}-${num}`;
        if (!seen.has(id)) { seen.add(id); candidates.push(id); }
      }
    }

    // --- Priority 1: TCGPlayer direct via redirect resolution ---
    for (const ptcgioId of candidates) {
      const productId = await resolveTCGPlayerProductId(ptcgioId);
      if (productId != null) {
        const pricing = await fetchTCGPlayerPricePoints(productId);
        if (pricing != null) return pricing;
      }
    }

    // --- Priority 2: PTCG.io inline prices ---
    for (const id of candidates) {
      const res = await fetch(`${PTCGIO_BASE}/cards/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { data: PtcgCard };
        const pricing = extractPricing(data.data);
        if (pricing.marketPrice != null || pricing.lowPrice != null) return pricing;
      }
    }

    // --- Priority 3: Name+rarity fallback ---
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
    let cards = await fetchCards(`*${query}*`);

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

    const bestMatch = cards.find((c) => !c.id.startsWith("tk"));
    const bestName = bestMatch?.name ?? query;

    const bestWords = bestName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const anchorWord = bestWords[0];
    const filteredCards = anchorWord
      ? cards.filter((c) => c.name.toLowerCase().includes(anchorWord))
      : cards;

    const [variants, pricing] = await Promise.all([
      buildResults(filteredCards),
      fetchPricing(bestName),
    ]);

    return { variants, pricing };
  } catch {
    return { variants: [], pricing: emptyPricing };
  }
}
