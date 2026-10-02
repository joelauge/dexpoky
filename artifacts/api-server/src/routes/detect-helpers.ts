import { getTcgcsvPricing } from "../lib/tcgcsv.js";
import { isGradedSlabListingTitle } from "../lib/grading.js";
import { verifiedEbaySales, type EbaySale, type EbayTarget } from "../lib/ebay-comparables.js";

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
  image?: string | null;
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

/**
 * Construct strict TCGdex card IDs from the two identifiers printed on a card.
 * OCR often returns a language suffix ("MEE EN") or padded numbers, but must
 * never turn a partial set code into a broad name search.
 */
export function buildDirectIdentityCandidates(setCode: string, cardNumber: string): string[] {
  const set = normalizeSetCode(setCode.replace(/\s+(?:en|jp|fr|de|es|it|pt)$/i, ""));
  const raw = cardNumber.trim().split("/")[0] ?? "";
  if (!set || !/^\d+$/.test(raw)) return [];
  const numeric = String(parseInt(raw, 10));
  return [...new Set([raw, numeric].map((number) => `${set}-${number}`))];
}

async function fetchCardsBySetAndLocalId(setCode: string, cardNumber: string): Promise<CardBrief[]> {
  const candidates = buildDirectIdentityCandidates(setCode, cardNumber);
  const results = await Promise.all(candidates.map(async (id) => {
    try {
      const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`);
      if (!res.ok) return [];
      const data = await res.json();
      if (!data || typeof data !== "object" || !data.id) return [];
      return [{
        id: String(data.id),
        localId: String(data.localId ?? ""),
        name: String(data.name ?? ""),
        // Detail responses omit `image` when no catalog artwork exists.
        // Preserve that as an explicit null so buildResults does not
        // manufacture a URL that returns 404.
        image: typeof data.image === "string" ? data.image : null,
      }];
    } catch {
      return [];
    }
  }));
  const seen = new Set<string>();
  return results.flat().filter((card) => !seen.has(card.id) && (seen.add(card.id), true));
}

export interface EbaySoldPricing {
  verifiedSales?: EbaySale[];
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

function emptyPricing(): PricingData {
  return { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
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
 * and graded slabs (grading-company mentions) so we report raw-card market values.
 */
export async function fetchEbaySoldPricing(
  name: string,
  setName?: string,
  cardNumber?: string,
  target?: EbayTarget,
): Promise<EbaySoldPricing | null> {
  const query = buildEbayQuery(name, setName, cardNumber);
  const cacheKey = `${query.toLowerCase()}:${target ? JSON.stringify(target) : "reference"}`;
  const cached = ebayCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const searchUrl =
    `https://www.ebay.com/sch/i.html` +
    `?_nkw=${encodeURIComponent(query)}` +
    `&_sacat=0&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let res: Response;
    let html: string;
    try {
      res = await fetch(searchUrl, {
        headers: {
          "User-Agent": EBAY_UA,
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
      });
      html = await res.text();
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      ebayCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: null });
      return null;
    }
    const verifiedSales = target ? verifiedEbaySales(html, target) : [];

    // Extract each result item block; each contains a price + title.
    // s-item__price spans hold the actual listed/sold price.
    const itemBlocks = html.split(/class="s-item\b/).slice(1);
    const samples: number[] = [];
    for (const block of itemBlocks) {
      const titleMatch = block.match(/class="s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|h3)>/i);
      const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
      // Skip placeholder rows and graded slabs
      if (!title || /shop on ebay/i.test(title)) continue;
      if (isGradedSlabListingTitle(title)) continue;

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

    if (samples.length < 3 && verifiedSales.length === 0) {
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
      verifiedSales,
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
  const normal = tcgPrices.normal ?? tcgPrices.Normal;
  const tcgMarket = normal?.market ?? null;
  const tcgLow = normal?.low ?? null;
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
    // Missing Normal is an exact pricing miss; never substitute foil or
    // another finish's value.
    const marketPrice = normal?.marketPrice ?? null;
    const lowPrice = normal?.listedMedianPrice ?? null;

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

type ExactMarket = {
  marketPrice?: number | null;
  lowPrice?: number | null;
};

/** Parse exact-printing prices from TCGdex's variants_detailed payload. */
export function extractTcgdexDetailPricing(data: unknown): PricingData | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as { variants_detailed?: unknown }).variants_detailed;
  if (!raw || typeof raw !== "object") return null;

  const entries = Array.isArray(raw)
    ? raw
    : (raw as { normal?: unknown }).normal != null
      ? [(raw as { normal: unknown }).normal]
      : [];
  const entry = entries.find((item) =>
    item && typeof item === "object" &&
    String((item as { type?: unknown }).type ?? "").toLowerCase() === "normal"
  );
  if (!entry || typeof entry !== "object") return null;

  const pricing = (entry as { pricing?: unknown }).pricing;
  const priceRoot = pricing && typeof pricing === "object" ? pricing as Record<string, unknown> : {};
  const tcgplayer = priceRoot.tcgplayer && typeof priceRoot.tcgplayer === "object"
    ? priceRoot.tcgplayer as Record<string, unknown>
    : {};
  const normal = tcgplayer.normal && typeof tcgplayer.normal === "object"
    ? tcgplayer.normal as ExactMarket
    : ("marketPrice" in tcgplayer || "lowPrice" in tcgplayer)
      ? tcgplayer as ExactMarket
      : undefined;

  const marketPrice = normal?.marketPrice ?? null;
  const lowPrice = normal?.lowPrice ?? null;
  if (marketPrice != null || lowPrice != null) {
    return {
      marketPrice,
      lowPrice,
      trendPrice: null,
      source: "tcgplayer",
      psaEstimates: buildPsaEstimates(marketPrice),
    };
  }

  const cardmarket = priceRoot.cardmarket && typeof priceRoot.cardmarket === "object"
    ? priceRoot.cardmarket as {
        trend?: number | null;
        trendPrice?: number | null;
        avg?: number | null;
        low?: number | null;
      }
    : null;
  const resolvedMarket = cardmarket?.trendPrice ?? cardmarket?.trend ?? cardmarket?.avg ?? null;
  const resolvedLow = cardmarket?.low ?? null;
  if (resolvedMarket == null && resolvedLow == null) return null;
  return {
    marketPrice: resolvedMarket,
    lowPrice: resolvedLow,
    trendPrice: null,
    source: "cardmarket",
    psaEstimates: buildPsaEstimates(resolvedMarket),
  };
}

/** TCGdex card details expose the current exact-printing prices directly. */
async function fetchTcgdexDetailPricing(cardId: string): Promise<PricingData | null> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(cardId)}`);
    if (!res.ok) return null;
    return extractTcgdexDetailPricing(await res.json());
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
 *  3. TCGdex detail variants (when available)
 */
export async function fetchPricingById(
  tcgdexId: string,
  fallbackName?: string,
  fallbackRarity?: string,
  ebayContext?: { name: string; setName?: string; cardNumber?: string },
): Promise<PricingData> {
  if (tcgdexId.startsWith("tcgcsv_")) return getTcgcsvPricing(tcgdexId);
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

    // TCGdex is the authoritative printing identity and often has fresher
    // variant pricing than the downstream PTCG.io mirror.
    const tcgdexPricing = await fetchTcgdexDetailPricing(tcgdexId);
    if (tcgdexPricing) return { ...tcgdexPricing, ebay: await ebayPromise };

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

    // Never substitute another printing's name-level price for an exact ID.
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
  rarity: string | null;
}

/** Normalizes OCR/API identifiers without conflating unrelated set codes. */
export function normalizeSetCode(value: string | null | undefined): string {
  const compact = String(value ?? "")
    .toLowerCase()
    .replace(/\s+(?:en|jp|fr|de|es|it|pt)$/i, "")
    .replace(/[^a-z0-9]/g, "");
  // Set APIs vary between "sv01" and "sv1"; only remove zeroes immediately
  // before a numeric suffix, never zeroes in an otherwise textual code.
  return compact.replace(/^([a-z]+)0+(\d+)$/, "$1$2");
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameCardNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = parseCardNum(String(a ?? ""));
  const right = parseCardNum(String(b ?? ""));
  return !isNaN(left) && !isNaN(right) && left === right;
}

/**
 * Rank without discarding broad name results. Set+number is strongest, while
 * a number from a different set must not displace a set/name match.
 */
export function rankTcgResults(
  cards: TcgResult[],
  query: string,
  cardNumber?: string,
  setCode?: string,
): TcgResult[] {
  const targetSet = normalizeSetCode(setCode);
  const targetName = normalizeName(query);
  const scored = cards.map((card, index) => {
    const setMatch = !!targetSet && normalizeSetCode(card.setId) === targetSet;
    const numberMatch = sameCardNumber(card.cardNumber, cardNumber);
    const cardName = normalizeName(card.name);
    const nameMatch = cardName === targetName ||
      cardName.includes(targetName) || targetName.includes(cardName);
    let rank = 3;
    if (setMatch && numberMatch) rank = 0;
    else if (setMatch && nameMatch) rank = 1;
    else if (numberMatch && nameMatch) rank = 2;
    return { card, rank, index };
  });
  const seen = new Set<string>();
  return scored
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ card }) => card)
    .filter((card) => !seen.has(card.id) && (seen.add(card.id), true));
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
       // A detail response with image:null is an explicit "no catalog image"
       // signal. Do not manufacture an assets URL that will 404.
       imageUrl: card.image === null ? "" : card.image ? `${card.image}/high.png` : buildTcgdexImageUrl(card.id),
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
  setCode?: string,
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
        setCode
          ? fetchCardsBySetAndLocalId(setCode, cardNumber)
          : fetchCardsByNameAndLocalId(query, cardNumber),
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

    // Keep all broad name candidates. Card numbers are only unique within a
    // set, so filtering the broad list by a number can hide the right card.
    const byId = new Map<string, CardBrief>();
    for (const card of [...exactCards, ...broadCards]) byId.set(card.id, card);
    const mergedCards = [...byId.values()];
    const bestName = mergedCards.find((c) => !c.id.startsWith("tk"))?.name ?? query;

    const variants = await buildResults(mergedCards);

    const ranked = rankTcgResults(variants, query, cardNumber, setCode);
    variants.splice(0, variants.length, ...ranked);
    const top = variants[0];
    const pricing = top
      ? await fetchPricingById(top.id, top.name, top.rarity ?? undefined, {
        name: top.name,
        setName: top.setName,
        cardNumber: top.cardNumber,
      })
      : emptyPricing;

    // Add eBay sold-listing validation against the best matched variant
    const ebay = top
      ? await fetchEbaySoldPricing(bestName, top.setName, top.cardNumber)
      : await fetchEbaySoldPricing(bestName);

    return { variants, pricing: { ...pricing, ebay } };
  } catch {
    return { variants: [], pricing: emptyPricing };
  }
}

// ── eBay active listing search (for DexAgent external find alerts) ─────────────

export interface EbayActiveListing {
  title: string;
  priceUsd: number;
  url: string;
}

const EBAY_ACTIVE_TTL_MS = 15 * 60 * 1000; // 15 min
const ebayActiveCache = new Map<string, { expires: number; data: EbayActiveListing[] }>();

/**
 * Scrape eBay's Buy-It-Now active listings for a card name + optional set name,
 * up to maxPriceUsd. Returns up to 5 results sorted by price ascending.
 * Filters out graded slabs (PSA/BGS/CGC/TAG/SGC/ACE). Cached 15 minutes per query.
 */
export async function fetchEbayActiveListings(
  name: string,
  setName?: string,
  maxPriceUsd?: number,
): Promise<EbayActiveListing[]> {
  const query = buildEbayQuery(name, setName);
  const cacheKey = `active:${query.toLowerCase()}:${maxPriceUsd ?? "any"}`;
  const cached = ebayActiveCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const params = new URLSearchParams({
    _nkw: query,
    _sacat: "0",
    LH_BIN: "1",       // Buy It Now only
    _sop: "15",        // Price + shipping: lowest first
    _ipg: "25",
  });
  if (maxPriceUsd != null) {
    params.set("_udhi", maxPriceUsd.toFixed(2));
  }

  const searchUrl = `https://www.ebay.com/sch/i.html?${params.toString()}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
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
      ebayActiveCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: [] });
      return [];
    }

    const html = await res.text();
    const results: EbayActiveListing[] = [];
    const itemBlocks = html.split(/class="s-item\b/).slice(1);

    for (const block of itemBlocks) {
      const titleMatch = block.match(/class="s-item__title[^"]*"[^>]*>([\s\S]*?)<\/(?:span|div|h3)>/i);
      const title = (titleMatch?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
      if (!title || /shop on ebay/i.test(title)) continue;
      if (isGradedSlabListingTitle(title)) continue;

      const priceMatch = block.match(/class="s-item__price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!priceMatch) continue;
      const priceText = priceMatch[1].replace(/<[^>]+>/g, "");
      const numMatch = priceText.match(/\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/);
      if (!numMatch) continue;
      const priceUsd = parseFloat(numMatch[1].replace(",", ""));
      if (!isFinite(priceUsd) || priceUsd <= 0) continue;
      if (maxPriceUsd != null && priceUsd > maxPriceUsd) continue;

      // Extract item URL and strip tracking params
      const urlMatch = block.match(/href="(https:\/\/www\.ebay\.com\/itm\/[^"?]+)(?:[^"]*)?"/i);
      if (!urlMatch) continue;
      const url = urlMatch[1];

      results.push({ title, priceUsd, url });
      if (results.length >= 5) break;
    }

    ebayActiveCache.set(cacheKey, { expires: Date.now() + EBAY_ACTIVE_TTL_MS, data: results });
    return results;
  } catch {
    ebayActiveCache.set(cacheKey, { expires: Date.now() + 5 * 60 * 1000, data: [] });
    return [];
  }
}
