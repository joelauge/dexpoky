/**
 * PokeWallet API client.
 *
 * Wraps `https://api.pokewallet.io` (`/search`, `/cards/:id`, `/sets`).
 * Attaches `X-API-Key` from POKEWALLET_API_KEY. Caches responses in-memory
 * to stay under the free-tier 100/hr limit.
 *
 * Returns a discriminated `PokeWalletResult` so callers can react to
 * `RATE_LIMITED` / `MISSING_KEY` / `ERROR` without try/catch noise.
 */
import { logger } from "./logger.js";

const BASE_URL = "https://api.pokewallet.io";

const SEARCH_TTL_MS = 6 * 60 * 60 * 1000;   // 6h
const CARD_TTL_MS   = 24 * 60 * 60 * 1000;  // 24h
const SETS_TTL_MS   = 24 * 60 * 60 * 1000;  // 24h
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000; // remember rate-limited state for 5 min

// ──────────────────────────── Raw response shapes ────────────────────────────

export interface PokeWalletCardInfo {
  name: string;
  clean_name?: string | null;
  set_name?: string | null;
  set_code?: string | null;
  set_id?: string | null;
  card_number?: string | null;
  rarity?: string | null;
  card_type?: string | null;
  hp?: string | null;
  stage?: string | null;
  card_text?: string | null;
  attacks?: string[] | null;
  weakness?: string | null;
  resistance?: string | null;
  retreat_cost?: string | null;
  image_url?: string | null;
}

export interface PokeWalletTcgPlayerPrice {
  low_price: number | null;
  mid_price: number | null;
  high_price: number | null;
  market_price: number | null;
  direct_low_price: number | null;
  sub_type_name: string | null;
  updated_at?: string | null;
}

export interface PokeWalletTcgPlayer {
  prices?: PokeWalletTcgPlayerPrice[];
  url?: string | null;
}

export interface PokeWalletCardMarketPrice {
  avg: number | null;
  low: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  trend: number | null;
  variant_type: string | null;
  updated_at?: string | null;
}

export interface PokeWalletCardMarket {
  product_name?: string | null;
  prices?: PokeWalletCardMarketPrice[];
  product_url?: string | null;
}

export interface PokeWalletCard {
  id: string;
  card_info: PokeWalletCardInfo;
  tcgplayer?: PokeWalletTcgPlayer | null;
  cardmarket?: PokeWalletCardMarket | null;
  image_url?: string | null;
}

export interface PokeWalletSearchResponse {
  query: string;
  results: PokeWalletCard[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
  metadata?: Record<string, unknown>;
}

export interface PokeWalletSet {
  set_id: string;
  set_code: string;
  set_name: string;
  card_count?: number | null;
  release_date?: string | null;
}

export interface PokeWalletSetsResponse {
  sets: PokeWalletSet[];
  pagination?: { page: number; limit: number; total: number; total_pages: number };
}

// ──────────────────────────── Result envelope ────────────────────────────────

export type PokeWalletResult<T> =
  | { ok: true; data: T; remainingHour: number | null; remainingDay: number | null }
  | { ok: false; reason: "MISSING_KEY" | "RATE_LIMITED" | "NOT_FOUND" | "ERROR"; message?: string };

// ──────────────────────────── Cache ──────────────────────────────────────────

interface CacheEntry<T> {
  expires: number;
  data: T;
}

const searchCache = new Map<string, CacheEntry<PokeWalletSearchResponse>>();
const cardCache = new Map<string, CacheEntry<PokeWalletCard>>();
const setsCache = new Map<string, CacheEntry<PokeWalletSetsResponse>>();

let rateLimitedUntil = 0;
let warnedMissingKey = false;

function cacheKeySearch(q: string, limit: number): string {
  return `${q.trim().toLowerCase()}::${limit}`;
}

function getApiKey(): string | null {
  const key = process.env.POKEWALLET_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

interface FetchOpts {
  path: string;
  ttlMs: number;
  cache?: Map<string, CacheEntry<unknown>>;
  cacheKey?: string;
}

async function fetchPokeWallet<T>(opts: FetchOpts): Promise<PokeWalletResult<T>> {
  const apiKey = getApiKey();
  if (!apiKey) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      logger.warn(
        "POKEWALLET_API_KEY is not set — PokeWallet catalog disabled, falling back to TCGdex.",
      );
    }
    return { ok: false, reason: "MISSING_KEY" };
  }

  if (opts.cache && opts.cacheKey) {
    const cached = opts.cache.get(opts.cacheKey);
    if (cached && cached.expires > Date.now()) {
      return { ok: true, data: cached.data as T, remainingHour: null, remainingDay: null };
    }
  }

  if (isRateLimited()) {
    return { ok: false, reason: "RATE_LIMITED", message: "Cached rate-limit cooldown" };
  }

  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    res = await fetch(`${BASE_URL}${opts.path}`, {
      headers: {
        "X-API-Key": apiKey,
        "Accept": "application/json",
        "User-Agent": "DexPoky/1.0",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch (err) {
    logger.warn({ err, path: opts.path }, "PokeWallet network error");
    return { ok: false, reason: "ERROR", message: "Network error" };
  }

  const remainingHourHeader = res.headers.get("x-ratelimit-remaining-hour");
  const remainingDayHeader = res.headers.get("x-ratelimit-remaining-day");
  const remainingHour = remainingHourHeader != null ? Number(remainingHourHeader) : null;
  const remainingDay = remainingDayHeader != null ? Number(remainingDayHeader) : null;

  if (remainingHour != null && remainingHour <= 5) {
    logger.warn(
      { remainingHour, remainingDay, path: opts.path },
      "PokeWallet rate limit running low",
    );
  }

  if (res.status === 429) {
    rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    logger.warn(
      { path: opts.path, remainingHour, remainingDay },
      "PokeWallet rate limited (429) — backing off for 5 minutes",
    );
    return { ok: false, reason: "RATE_LIMITED", message: "Hit hourly rate limit" };
  }

  if (res.status === 404) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  if (!res.ok) {
    logger.warn({ status: res.status, path: opts.path }, "PokeWallet non-OK response");
    return { ok: false, reason: "ERROR", message: `Status ${res.status}` };
  }

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch (err) {
    logger.warn({ err, path: opts.path }, "PokeWallet JSON parse error");
    return { ok: false, reason: "ERROR", message: "Invalid JSON" };
  }

  if (opts.cache && opts.cacheKey) {
    opts.cache.set(opts.cacheKey, { expires: Date.now() + opts.ttlMs, data: data as unknown as never });
  }

  return { ok: true, data, remainingHour, remainingDay };
}

// ──────────────────────────── Public API ─────────────────────────────────────

export async function pwSearch(
  query: string,
  limit = 20,
): Promise<PokeWalletResult<PokeWalletSearchResponse>> {
  const q = query.trim();
  if (!q) {
    return { ok: true, data: { query: q, results: [] }, remainingHour: null, remainingDay: null };
  }
  const key = cacheKeySearch(q, limit);
  return fetchPokeWallet<PokeWalletSearchResponse>({
    path: `/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ttlMs: SEARCH_TTL_MS,
    cache: searchCache as Map<string, CacheEntry<unknown>>,
    cacheKey: key,
  });
}

export async function pwGetCard(
  id: string,
): Promise<PokeWalletResult<PokeWalletCard>> {
  const cleaned = id.trim();
  if (!cleaned) return { ok: false, reason: "NOT_FOUND" };
  return fetchPokeWallet<PokeWalletCard>({
    path: `/cards/${encodeURIComponent(cleaned)}`,
    ttlMs: CARD_TTL_MS,
    cache: cardCache as Map<string, CacheEntry<unknown>>,
    cacheKey: cleaned,
  });
}

export async function pwListSets(
  page = 1,
  limit = 100,
): Promise<PokeWalletResult<PokeWalletSetsResponse>> {
  const cacheKey = `${page}::${limit}`;
  return fetchPokeWallet<PokeWalletSetsResponse>({
    path: `/sets?page=${page}&limit=${limit}`,
    ttlMs: SETS_TTL_MS,
    cache: setsCache as Map<string, CacheEntry<unknown>>,
    cacheKey,
  });
}

// ──────────────────────────── Normalizers ────────────────────────────────────

export interface NormalizedCatalogCard {
  id: string;
  name: string;
  pokemonName: string;
  setName: string;
  setCode: string;
  cardNumber: string;
  rarity: string | null;
  imageUrl: string;
  marketPrice: number | null;
  tcgplayerUrl: string | null;
  cardmarketUrl: string | null;
}

const PWAL_PLACEHOLDER_IMAGE = "";

function pickTcgplayerMarket(card: PokeWalletCard): number | null {
  const prices = card.tcgplayer?.prices ?? [];
  const normal = prices.find((p) => p.sub_type_name === "Normal" && p.market_price != null);
  if (normal?.market_price != null) return normal.market_price;
  const holo = prices.find((p) => p.sub_type_name === "Holofoil" && p.market_price != null);
  if (holo?.market_price != null) return holo.market_price;
  const reverse = prices.find((p) => p.sub_type_name === "Reverse Holofoil" && p.market_price != null);
  if (reverse?.market_price != null) return reverse.market_price;
  const any = prices.find((p) => p.market_price != null);
  return any?.market_price ?? null;
}

function pickCardmarketTrend(card: PokeWalletCard): number | null {
  const prices = card.cardmarket?.prices ?? [];
  const normal = prices.find((p) => p.variant_type === "normal");
  if (normal?.trend != null) return normal.trend;
  if (normal?.avg != null) return normal.avg;
  const holo = prices.find((p) => p.variant_type === "holo");
  if (holo?.trend != null) return holo.trend;
  if (holo?.avg != null) return holo.avg;
  const any = prices.find((p) => p.trend != null || p.avg != null);
  return any?.trend ?? any?.avg ?? null;
}

/** Best-effort Pokémon-name extraction from a card's full name. */
export function extractPokemonName(cardName: string): string {
  // Strip trailing modifiers — "Charizard VMAX" -> "Charizard"
  const stripped = cardName
    .replace(/\b(VMAX|VSTAR|GX|EX|V|TAG TEAM|BREAK|LV\.?X|LEGEND|Prime|☆|★|Star|δ|Delta|ex)\b.*$/i, "")
    .trim();
  return stripped || cardName;
}

export function normalizeCatalogCard(raw: PokeWalletCard): NormalizedCatalogCard {
  const info = raw.card_info ?? ({} as PokeWalletCardInfo);
  const tcgMarket = pickTcgplayerMarket(raw);
  const cmTrend = pickCardmarketTrend(raw);
  const marketPrice = tcgMarket ?? cmTrend ?? null;
  const name = info.clean_name?.trim() || info.name?.trim() || "Unknown card";
  return {
    id: raw.id,
    name,
    pokemonName: extractPokemonName(name),
    setName: (info.set_name ?? "").trim(),
    setCode: (info.set_code ?? "").trim(),
    cardNumber: (info.card_number ?? "").trim(),
    rarity: info.rarity ?? null,
    imageUrl: raw.image_url ?? info.image_url ?? PWAL_PLACEHOLDER_IMAGE,
    marketPrice: marketPrice != null ? Math.round(marketPrice * 100) / 100 : null,
    tcgplayerUrl: raw.tcgplayer?.url ?? null,
    cardmarketUrl: raw.cardmarket?.product_url ?? null,
  };
}

// ──────────────────────────── TCGdex image backfill ──────────────────────────
//
// PokeWallet does not return image URLs. We backfill them from TCGdex by
// querying `GET /v2/en/cards?name=&localId=` and appending `/high.webp` to the
// returned `image` base. Cached in-memory for 24h. Safe no-op when the card
// already has an image (e.g. TCGdex fallback path).

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const TCGDEX_TTL_MS = 24 * 60 * 60 * 1000;
const tcgdexImageCache = new Map<string, CacheEntry<string | null>>();

interface TcgdexCardSummary {
  id: string;
  localId: string;
  name: string;
  image?: string | null;
}

/** Strip `/91` suffix from PokeWallet card numbers like "054/091". */
function normalizeLocalId(cardNumber: string): string {
  const trimmed = cardNumber.trim();
  if (!trimmed) return "";
  return trimmed.split("/")[0]!.trim();
}

/**
 * Derive a TCGdex image URL from a card ID (e.g. "xy7-1", "xyp-XY95", "sm3-045").
 * Image URLs follow: https://assets.tcgdex.net/en/{group}/{setId}/{localId}/high.png
 * where {group} is the leading letter-prefix of setId, with trailing "p" stripped for promos.
 */
function buildTcgdexImageUrlFromId(cardId: string): string {
  const dash = cardId.lastIndexOf("-");
  if (dash < 0) return "";
  const setId = cardId.slice(0, dash).toLowerCase();
  const localId = cardId.slice(dash + 1);
  const letters = setId.match(/^[a-z]+/)?.[0] ?? setId;
  const group = letters.endsWith("p") && letters.length > 2 ? letters.slice(0, -1) : letters;
  return `https://assets.tcgdex.net/en/${group}/${setId}/${localId}/high.png`;
}

async function lookupTcgdexImage(
  name: string,
  cardNumber: string,
): Promise<string | null> {
  const localIdPadded = normalizeLocalId(cardNumber);      // "080"
  if (!name.trim() || !localIdPadded) return null;
  const localIdInt = String(parseInt(localIdPadded, 10));  // "80"

  // Cache keyed on the padded form (canonical)
  const cacheKey = `${name.trim().toLowerCase()}::${localIdPadded}`;
  const cached = tcgdexImageCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  async function tryFetch(localId: string): Promise<TcgdexCardSummary | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        `${TCGDEX_BASE}/cards?name=${encodeURIComponent(name)}&localId=${encodeURIComponent(localId)}`,
        { headers: { Accept: "application/json", "User-Agent": "DexPoky/1.0" }, signal: controller.signal },
      );
      clearTimeout(timer);
      if (!res.ok) return null;
      const list = (await res.json()) as TcgdexCardSummary[];
      if (!Array.isArray(list) || list.length === 0) return null;
      // Prefer exact localId match; fall back to first result
      return list.find((c) => c.localId === localId) ?? list[0] ?? null;
    } catch {
      return null;
    }
  }

  try {
    // Try both the zero-padded form ("080") and the plain integer form ("80")
    // in parallel — TCGdex sets vary in which convention they use.
    const [paddedMatch, intMatch] = await Promise.all([
      tryFetch(localIdPadded),
      localIdPadded !== localIdInt ? tryFetch(localIdInt) : Promise.resolve(null),
    ]);
    const match = paddedMatch ?? intMatch;

    // TCGdex list endpoints omit `image` — derive the URL from the card ID.
    const full = match
      ? (match.image ? `${match.image}/high.webp` : buildTcgdexImageUrlFromId(match.id))
      : null;
    tcgdexImageCache.set(cacheKey, { expires: Date.now() + TCGDEX_TTL_MS, data: full });
    return full;
  } catch (err) {
    logger.debug({ err, name, localIdPadded }, "TCGdex image lookup failed");
    tcgdexImageCache.set(cacheKey, { expires: Date.now() + TCGDEX_TTL_MS, data: null });
    return null;
  }
}

/**
 * Fill in `imageUrl` for any catalog cards missing one by querying TCGdex.
 * Bounded to ~5 concurrent lookups to be polite to the public TCGdex API.
 * Cards that already have an image are passed through unchanged.
 */
export async function enrichCatalogCardImages(
  cards: NormalizedCatalogCard[],
): Promise<NormalizedCatalogCard[]> {
  const out: NormalizedCatalogCard[] = new Array(cards.length);
  const concurrency = 5;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= cards.length) return;
      const card = cards[i]!;
      if (card.imageUrl) {
        out[i] = card;
        continue;
      }
      // Use clean PokeWallet name (e.g. "Charizard ex 054 091") trimmed of trailing
      // numbers — TCGdex matches better with just the card name.
      const lookupName = card.name.replace(/\s+\d{1,4}\s*\d*$/, "").trim() || card.pokemonName;
      const image = await lookupTcgdexImage(lookupName, card.cardNumber);
      out[i] = image ? { ...card, imageUrl: image } : card;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, cards.length) }, worker));
  return out;
}

/**
 * Map raw PokeWallet rarity strings to our internal `rarityEnum`.
 * Used when pre-filling the manual Add Card form.
 */
export function mapRarity(
  raw: string | null | undefined,
): "common" | "uncommon" | "rare" | "holo_rare" | "ultra_rare" | "secret_rare" | "promo" {
  if (!raw) return "common";
  const r = raw.toLowerCase();
  if (r.includes("secret")) return "secret_rare";
  if (r.includes("rainbow") || r.includes("hyper") || r.includes("special illustration")) return "secret_rare";
  if (r.includes("ultra") || r.includes("vmax") || r.includes("vstar") || r.includes("ex") || r.includes(" gx") || r === "gx") return "ultra_rare";
  if (r.includes("holo")) return "holo_rare";
  if (r.includes("promo")) return "promo";
  if (r.includes("uncommon")) return "uncommon";
  if (r.includes("rare")) return "rare";
  if (r.includes("common")) return "common";
  return "rare";
}

// ──────────────────────────── Pricing builder ────────────────────────────────

import type { PricingData } from "../routes/detect-helpers.js";

const PSA_MULTIPLIERS: Record<number, number> = {
  10: 5.0,
  9:  2.0,
  8:  1.3,
  7:  0.9,
  6:  0.7,
  5:  0.5,
};

function buildPsaEstimates(marketPrice: number | null): Record<number, number> | null {
  if (marketPrice == null) return null;
  return Object.fromEntries(
    Object.entries(PSA_MULTIPLIERS).map(([grade, mult]) => [
      Number(grade),
      Math.round(marketPrice * mult * 100) / 100,
    ]),
  );
}

export function buildPricingFromCatalog(raw: PokeWalletCard): PricingData {
  const tcgMarket = pickTcgplayerMarket(raw);
  const tcgLow = (raw.tcgplayer?.prices ?? [])
    .map((p) => p.low_price)
    .find((v) => v != null) ?? null;
  const cmTrend = pickCardmarketTrend(raw);
  const cmLow = (raw.cardmarket?.prices ?? [])
    .map((p) => p.low)
    .find((v) => v != null) ?? null;

  const marketPrice = tcgMarket ?? cmTrend;
  const lowPrice = tcgLow ?? cmLow;
  const trendPrice = cmTrend ?? null;
  const source: PricingData["source"] =
    tcgMarket != null ? "tcgplayer" : cmTrend != null ? "cardmarket" : null;
  return {
    marketPrice,
    lowPrice,
    trendPrice,
    source,
    psaEstimates: buildPsaEstimates(marketPrice),
  };
}
