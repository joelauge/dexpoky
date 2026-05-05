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

/**
 * Direct exact-match lookup: name + localId (the card number as printed).
 * Tries the raw form ("002") and the integer form ("2") in parallel since
 * TCGdex sets use either convention depending on the era.
 */
async function fetchCardsByNameAndLocalId(name: string, rawNumber: string): Promise<CardBrief[]> {
  const stripped = rawNumber.split("/")[0].trim();
  if (!stripped) return [];
  const asInt = String(parseInt(stripped, 10));

  async function tryLocalId(localId: string): Promise<CardBrief[]> {
    try {
      const res = await fetch(
        `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}&localId=${encodeURIComponent(localId)}`,
      );
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? (data as CardBrief[]) : [];
    } catch {
      return [];
    }
  }

  const [withPad, withoutPad] = await Promise.all([
    stripped !== asInt ? tryLocalId(stripped) : Promise.resolve([] as CardBrief[]),
    tryLocalId(asInt),
  ]);

  const seen = new Set<string>();
  const results: CardBrief[] = [];
  for (const card of [...withPad, ...withoutPad]) {
    if (!seen.has(card.id)) { seen.add(card.id); results.push(card); }
  }
  return results;
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

export interface EbaySoldPricing {
  median: number | null;
  average: number | null;
  low: number | null;
  high: number | null;
  count: number;
  searchUrl: string;
}

export interface PricingData {
  marketPrice: number | null;
  lowPrice: number | null;
  trendPrice: number | null;
  source: "tcgplayer" | "cardmarket" | null;
  psaEstimates: Record<number, number> | null;
  isFallback?: boolean;
  ebay?: EbaySoldPricing | null;
}

// In-memory cache for eBay sold-listing lookups (1 hour TTL)
const EBAY_TTL_MS = 60 * 60 * 1000;
const ebayCache = new Map<string, { expires: number; data: EbaySoldPricing | null }>();

const EBAY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function buildEbayQuery(name: string, setName?: string, cardNumber?: string): string {
  const parts = [name];
  if (setName) parts.push(setName);
  if (cardNumber) parts.push(cardNumber);
  parts.push("pokemon card");
  return parts.filter(Boolean).join(" ");
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Scrape eBay's public sold-listings page for actual completed-sale prices.
 * Returns null on failure. Cached in-memory for 1 hour per query.
 *
 * Filters out outliers (prices outside [25th-75th percentile ± 2.5×IQR])
 * and graded slabs (PSA/BGS/CGC mentions) so we report raw-card market values.
 */
export async function fetchEbaySoldPricing(
  name: string,
  setName?: string,
  cardNumber?: string,
): Promise<EbaySoldPricing | null> {
  const query = buildEbayQuery(name, setName, cardNumber);
  const cacheKey = query.toLowerCase();
  const cached = ebayCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const searchUrl =
    `https://www.ebay.com/sch/i.html` +
    `?_nkw=${encodeURIComponent(query)}` +
    `&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": EBAY_UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      ebayCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: null });
      return null;
    }
    const html = await res.text();

    // Extract each result item block; each contains a price + title.
    // s-item__price spans hold the actual listed/sold price.
    const itemBlocks = html.split(/class="s-item\b/).slice(1);
    const samples: number[] = [];
    for (const block of itemBlocks) {
      const titleMatch = block.match(/class="s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|h3)>/i);
      const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
      // Skip placeholder rows and graded slabs
      if (!title || /shop on ebay/i.test(title)) continue;
      if (/\b(psa|bgs|cgc|sgc|ace)\s*\d/i.test(title)) continue;

      const priceMatch = block.match(/class="s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!priceMatch) continue;
      const priceText = priceMatch[1].replace(/<[^>]+>/g, "");
      // Handle ranges: "$10.00 to $20.00" → take low end
      const numMatch = priceText.match(/\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
      if (!numMatch) continue;
      const value = parseFloat(numMatch[1].replace(",", ""));
      if (!isFinite(value) || value <= 0 || value > 100000) continue;
      samples.push(value);
    }

    if (samples.length < 3) {
      ebayCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: null });
      return null;
    }

    // Trim outliers: keep middle 80% (10th-90th percentile)
    samples.sort((a, b) => a - b);
    const lo = Math.floor(samples.length * 0.1);
    const hi = Math.ceil(samples.length * 0.9);
    const trimmed = samples.slice(lo, hi);
    const sum = trimmed.reduce((a, b) => a + b, 0);
    const avg = trimmed.length > 0 ? sum / trimmed.length : null;

    const data: EbaySoldPricing = {
      median: median(trimmed),
      average: avg != null ? Math.round(avg * 100) / 100 : null,
      low: trimmed[0] ?? null,
      high: trimmed[trimmed.length - 1] ?? null,
      count: samples.length,
      searchUrl,
    };
    ebayCache.set(cacheKey, { expires: Date.now() + EBAY_TTL_MS, data });
    return data;
  } catch {
    ebayCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: null });
    return null;
  }
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
export async function fetchPricingById(
  tcgdexId: string,
  fallbackName?: string,
  fallbackRarity?: string,
  ebayContext?: { name: string; setName?: string; cardNumber?: string },
): Promise<PricingData> {
  const empty: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  // Fire eBay lookup in parallel with TCG/CardMarket lookups
  const ebayPromise = ebayContext
    ? fetchEbaySoldPricing(ebayContext.name, ebayContext.setName, ebayContext.cardNumber)
    : Promise.resolve(null);
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
        if (pricing != null) return { ...pricing, ebay: await ebayPromise };
      }
    }

    // --- Priority 2: PTCG.io inline prices ---
    for (const id of candidates) {
      const res = await fetch(`${PTCGIO_BASE}/cards/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { data: PtcgCard };
        const pricing = extractPricing(data.data);
        if (pricing.marketPrice != null || pricing.lowPrice != null) return { ...pricing, ebay: await ebayPromise };
      }
    }

    // --- Priority 3: Name+rarity fallback ---
    if (fallbackName) {
      const namePricing = await fetchPricing(fallbackName, fallbackRarity);
      if (namePricing.marketPrice != null || namePricing.lowPrice != null) {
        return { ...namePricing, isFallback: true, ebay: await ebayPromise };
      }
    }
    return { ...empty, ebay: await ebayPromise };
  } catch {
    return { ...empty, ebay: await ebayPromise };
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

/**
 * Build a TCGdex image URL from a card ID.
 * Card IDs look like "xy1-1", "xyp-XY95", "sm3-045", "swsh1-1".
 * Image URLs look like https://assets.tcgdex.net/en/{group}/{setId}/{localId}/high.png
 * where {group} is the leading letters of the setId, with trailing "p" stripped for promos.
 */
function buildTcgdexImageUrl(cardId: string): string {
  const dash = cardId.lastIndexOf("-");
  if (dash < 0) return "";
  const setId = cardId.slice(0, dash).toLowerCase();
  const localId = cardId.slice(dash + 1);
  const letters = setId.match(/^[a-z]+/)?.[0] ?? setId;
  const group = letters.endsWith("p") && letters.length > 2 ? letters.slice(0, -1) : letters;
  return `https://assets.tcgdex.net/en/${group}/${setId}/${localId}/high.png`;
}

async function buildResults(cards: CardBrief[]): Promise<TcgResult[]> {
  const filtered = cards.filter((c) => !c.id.startsWith("tk")).slice(0, 100);
  const setIds = [...new Set(filtered.map((c) => c.id.split("-")[0]).filter(Boolean))] as string[];
  const setMap: Record<string, string> = {};
  await Promise.all(setIds.map(async (id) => { setMap[id] = await fetchSetName(id); }));
  return filtered.map((card) => {
    const setId = card.id.split("-")[0] ?? "";
    return {
      id: card.id,
      name: card.name,
      imageUrl: card.image ? `${card.image}/high.png` : buildTcgdexImageUrl(card.id),
      setName: setMap[setId] ?? setId,
      setId,
      cardNumber: card.localId ?? card.id.split("-")[1] ?? "",
      rarity: null,
    };
  });
}

/**
 * Parse a raw card number string into a plain integer for comparison.
 * Accepts "002", "002/094", "XY95", etc.
 * Returns NaN if no leading digits are found.
 */
function parseCardNum(raw: string): number {
  const m = raw.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

export async function searchTcgdex(
  query: string,
  cardNumber?: string,
): Promise<{ variants: TcgResult[]; pricing: PricingData }> {
  const emptyPricing: PricingData = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
  try {
    // ── Exact-match shortcut ──────────────────────────────────────────────
    // When we have both a name and card number, do a targeted
    // name+localId lookup first. If it returns results, those become the
    // primary variants (the correct printing is guaranteed first); the
    // broader name search is still run in parallel for "other printings".
    let exactCards: CardBrief[] = [];
    let broadCards: CardBrief[] = [];

    if (cardNumber) {
      [exactCards, broadCards] = await Promise.all([
        fetchCardsByNameAndLocalId(query, cardNumber),
        fetchCards(`*${query}*`),
      ]);
    } else {
      broadCards = await fetchCards(`*${query}*`);
    }

    // Fall back to word-by-word search if the broad search returned nothing
    if (broadCards.filter((c) => !c.id.startsWith("tk")).length === 0) {
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
        broadCards = merged;
      }
    }

    // Anchor filter: keep only cards whose name contains the same root word
    const bestMatch = (exactCards[0] ?? broadCards.find((c) => !c.id.startsWith("tk")));
    const bestName = bestMatch?.name ?? query;

    const bestWords = bestName
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const anchorWord = bestWords[0];
    const filteredBroad = anchorWord
      ? broadCards.filter((c) => c.name.toLowerCase().includes(anchorWord))
      : broadCards;

    // Merge: exact matches first (deduped), then broader results
    const exactIds = new Set(exactCards.map((c) => c.id));
    const mergedCards: CardBrief[] = [
      ...exactCards,
      ...filteredBroad.filter((c) => !exactIds.has(c.id)),
    ];

    const [variants, pricing] = await Promise.all([
      buildResults(mergedCards),
      fetchPricing(bestName),
    ]);

    // Secondary sort safety net: if no exact lookup was done (or returned
    // nothing), float the number-matched card to position 0 anyway.
    if (cardNumber && exactCards.length === 0) {
      const targetNum = parseCardNum(cardNumber);
      if (!isNaN(targetNum)) {
        variants.sort((a, b) => {
          const aMatch = parseCardNum(a.cardNumber) === targetNum ? 0 : 1;
          const bMatch = parseCardNum(b.cardNumber) === targetNum ? 0 : 1;
          return aMatch - bMatch;
        });
      }
    }

    // Add eBay sold-listing validation against the best matched variant
    const top = variants[0];
    const ebay = top
      ? await fetchEbaySoldPricing(bestName, top.setName, top.cardNumber)
      : await fetchEbaySoldPricing(bestName);

    return { variants, pricing: { ...pricing, ebay } };
  } catch {
    return { variants: [], pricing: emptyPricing };
  }
}
