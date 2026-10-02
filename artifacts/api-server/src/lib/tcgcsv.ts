import type { PricingData, TcgResult } from "../routes/detect-helpers.js";

const API_ROOT = "https://tcgcsv.com/tcgplayer";
const POKEMON_CATEGORY_ID = 3;
const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 10_000;
const FAILURE_COOLDOWN_MS = 30_000;
const GROUP_TTL_MS = 24 * 60 * 60 * 1000;
const PRODUCT_TTL_MS = 24 * 60 * 60 * 1000;
const PRICE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHED_COLLECTIONS = 256;
const MAX_INFLIGHT_GROUPS = 4;

export interface TcgcsvPokemonGroup {
  groupId: number;
  categoryId: number;
  name: string;
  abbreviation: string;
}

type TcgcsvGroup = TcgcsvPokemonGroup;

interface CatalogProduct {
  productId: number;
  groupId: number;
  categoryId: number;
  name: string;
  imageUrl: string;
  imageCount: number;
  extendedData: unknown[];
}

interface PriceRow {
  productId: number;
  groupId?: number;
  categoryId?: number;
  subTypeName: string;
  marketPrice: unknown;
  lowPrice: unknown;
  midPrice: unknown;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown[];
}

const collectionCache = new Map<string, CacheEntry>();
const collectionInflight = new Map<string, Promise<unknown[] | null>>();
const failedUntil = new Map<string, number>();

const EMPTY_PRICING: PricingData = {
  marketPrice: null,
  lowPrice: null,
  trendPrice: null,
  source: null,
  psaEstimates: null,
};

function strictPositiveInteger(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseTcgcsvId(id: string): { groupId: number; productId: number } | null {
  const match = /^tcgcsv_([1-9]\d*)_([1-9]\d*)$/.exec(id);
  if (!match) return null;
  const groupId = strictPositiveInteger(match[1]);
  const productId = strictPositiveInteger(match[2]);
  return groupId == null || productId == null ? null : { groupId, productId };
}

export function isTcgcsvId(id: string): boolean {
  return parseTcgcsvId(id) !== null;
}

function touchCache(key: string, entry: CacheEntry): void {
  collectionCache.delete(key);
  collectionCache.set(key, entry);
  while (collectionCache.size > MAX_CACHED_COLLECTIONS) {
    const oldest = collectionCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    collectionCache.delete(oldest);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validEnvelope(value: unknown): { results: unknown[]; totalItems: number } | null {
  if (!isRecord(value) || value.success !== true || !Array.isArray(value.results)) return null;
  if (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length > 0)) return null;
  // TCGCSV currently returns this form for a successful group with no products.
  // It is complete only when the result set is explicitly empty.
  if (value.totalItems === undefined && value.results.length === 0) {
    return { results: value.results, totalItems: 0 };
  }
  const totalItems = value.totalItems;
  if (typeof totalItems !== "number" || !Number.isSafeInteger(totalItems) || totalItems < 0) return null;
  return { results: value.results, totalItems };
}

async function fetchAllPages<T>(
  url: string,
  validateItem: (value: unknown) => value is T,
): Promise<T[] | null> {
  const results: T[] = [];
  let expectedTotal: number | null = null;

  while (expectedTotal === null || results.length < expectedTotal) {
    const pageUrl = `${url}${url.includes("?") ? "&" : "?"}limit=${PAGE_SIZE}&offset=${results.length}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    let payload: unknown;
    try {
      response = await fetch(pageUrl, {
        headers: {
          "User-Agent": "DexPoky/1.0 (Pokemon catalog lookup)",
          Accept: "application/json",
        },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      payload = await response.json();
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }

    const envelope = validEnvelope(payload);
    if (!envelope || (envelope.results.length > PAGE_SIZE && envelope.results.length !== envelope.totalItems)) return null;
    if (expectedTotal === null) expectedTotal = envelope.totalItems;
    if (envelope.totalItems !== expectedTotal) return null;
    if (results.length + envelope.results.length > expectedTotal) return null;
    if (envelope.results.some((item) => !validateItem(item))) return null;
    results.push(...envelope.results as T[]);
    if (results.length < expectedTotal && envelope.results.length === 0) return null;
  }

  return results;
}

async function fetchStaticRows<T>(
  url: string,
  validateItem: (value: unknown) => value is T,
): Promise<T[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(url, {
      headers: {
        "User-Agent": "DexPoky/1.0 (Pokemon catalog lookup)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    payload = await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.results)) return null;
  if (payload.errors !== undefined && (!Array.isArray(payload.errors) || payload.errors.length > 0)) return null;
  // Group prices are a static full array and TCGCSV omits totalItems on this endpoint.
  // If it is present, still require the envelope's count to describe the whole array.
  if (payload.totalItems !== undefined &&
    (typeof payload.totalItems !== "number" ||
      !Number.isSafeInteger(payload.totalItems) ||
      payload.totalItems !== payload.results.length)) return null;
  if (payload.results.some((item) => !validateItem(item))) return null;
  return payload.results as T[];
}

async function loadCollection<T>(
  key: string,
  url: string,
  ttlMs: number,
  validateItem: (value: unknown) => value is T,
  mode: "paged" | "static" = "paged",
): Promise<T[] | null> {
  const now = Date.now();
  const cached = collectionCache.get(key);
  if (cached && cached.expiresAt > now) {
    touchCache(key, cached);
    return cached.value as T[];
  }
  if (cached) collectionCache.delete(key);

  const pending = collectionInflight.get(key);
  if (pending) return await pending as T[] | null;

  const blockedUntil = failedUntil.get(key) ?? 0;
  if (blockedUntil > now) return null;
  failedUntil.delete(key);

  const request = (async (): Promise<unknown[] | null> => {
    try {
      const data = mode === "static"
        ? await fetchStaticRows(url, validateItem)
        : await fetchAllPages(url, validateItem);
      if (data === null) {
        failedUntil.set(key, Date.now() + FAILURE_COOLDOWN_MS);
        while (failedUntil.size > MAX_CACHED_COLLECTIONS) {
          const oldest = failedUntil.keys().next().value as string | undefined;
          if (oldest === undefined) break;
          failedUntil.delete(oldest);
        }
        return null;
      }
      touchCache(key, { value: data, expiresAt: Date.now() + ttlMs });
      return data;
    } finally {
      collectionInflight.delete(key);
    }
  })();
  collectionInflight.set(key, request);
  return await request as T[] | null;
}

function parseGroup(value: unknown): TcgcsvGroup | null {
  if (!isRecord(value)) return null;
  const groupId = strictPositiveInteger(value.groupId);
  const categoryId = strictPositiveInteger(value.categoryId);
  if (groupId == null || categoryId !== POKEMON_CATEGORY_ID || typeof value.name !== "string" || !value.name.trim()) {
    return null;
  }
  if (value.abbreviation != null && typeof value.abbreviation !== "string") return null;
  return {
    groupId,
    categoryId,
    name: value.name,
    abbreviation: typeof value.abbreviation === "string" ? value.abbreviation : "",
  };
}

async function getGroups(): Promise<TcgcsvGroup[] | null> {
  const groups = await loadCollection(
    "groups",
    `${API_ROOT}/${POKEMON_CATEGORY_ID}/groups`,
    GROUP_TTL_MS,
    (value): value is TcgcsvGroup => parseGroup(value) !== null,
  );
  if (!groups) return null;

  const parsed = groups.map(parseGroup);
  if (parsed.some((group) => group === null)) return null;
  const seen = new Set<number>();
  for (const group of parsed) {
    if (!group || seen.has(group.groupId)) return null;
    seen.add(group.groupId);
  }
  return parsed as TcgcsvGroup[];
}

function parseProduct(value: unknown, expectedGroupId: number): CatalogProduct | null {
  if (!isRecord(value)) return null;
  const productId = strictPositiveInteger(value.productId);
  const groupId = strictPositiveInteger(value.groupId);
  const categoryId = strictPositiveInteger(value.categoryId);
  if (
    productId == null ||
    groupId !== expectedGroupId ||
    categoryId !== POKEMON_CATEGORY_ID ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    (value.imageUrl != null && typeof value.imageUrl !== "string") ||
    (value.imageCount != null && (typeof value.imageCount !== "number" || !Number.isSafeInteger(value.imageCount) || value.imageCount < 0)) ||
    (value.extendedData != null && !Array.isArray(value.extendedData))
  ) return null;

  return {
    productId,
    groupId,
    categoryId,
    name: value.name,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : "",
    imageCount: typeof value.imageCount === "number" ? value.imageCount : 0,
    extendedData: Array.isArray(value.extendedData) ? value.extendedData : [],
  };
}

async function getProducts(groupId: number): Promise<CatalogProduct[] | null> {
  const products = await loadCollection(
    `products:${groupId}`,
    `${API_ROOT}/${POKEMON_CATEGORY_ID}/${groupId}/products`,
    PRODUCT_TTL_MS,
    (value): value is CatalogProduct => parseProduct(value, groupId) !== null,
  );
  if (!products) return null;

  const parsed = products.map((product) => parseProduct(product, groupId));
  if (parsed.some((product) => product === null)) return null;
  const seen = new Set<number>();
  for (const product of parsed) {
    if (!product || seen.has(product.productId)) return null;
    seen.add(product.productId);
  }
  return parsed as CatalogProduct[];
}

function extendedValue(product: CatalogProduct, wanted: string): string {
  for (const value of product.extendedData) {
    if (!isRecord(value)) continue;
    const key = String(value.name ?? value.displayName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key !== wanted) continue;
    if (typeof value.value === "string" || typeof value.value === "number") return String(value.value).trim();
  }
  return "";
}

function isNumberedSingle(product: CatalogProduct): boolean {
  const number = extendedValue(product, "number");
  const cardType = extendedValue(product, "cardtype").toLowerCase();
  const hasPokemonStats = !!extendedValue(product, "hp") && !!extendedValue(product, "stage");
  const elementalPokemonType = /^(?:grass|fire|water|lightning|electric|psychic|fighting|darkness|dark|metal|steel|colorless|dragon)$/.test(cardType);
  return !!number &&
    !/^(?:n\/?a|none|unknown|-)$/i.test(number) &&
    (/pokemon|pokémon|trainer|tool|ener(?:gy|gies)/.test(cardType) ||
      (elementalPokemonType && hasPokemonStats));
}

function safeImageUrl(product: CatalogProduct): string {
  if (product.imageCount <= 0 || !product.imageUrl) return "";
  try {
    const url = new URL(product.imageUrl);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function cardFromProduct(product: CatalogProduct, group: TcgcsvGroup, matchedSetCode?: string): TcgResult | null {
  if (!isNumberedSingle(product)) return null;
  const rarity = extendedValue(product, "rarity");
  return {
    id: `tcgcsv_${group.groupId}_${product.productId}`,
    name: product.name,
    imageUrl: safeImageUrl(product),
    setName: group.name,
    setId: (matchedSetCode ?? group.abbreviation) || nameCodePrefix(group.name) || "",
    cardNumber: extendedValue(product, "number"),
    rarity: rarity || null,
  };
}

function normalizeCode(value: string): string {
  const compact = value
    .toLowerCase()
    .replace(/\s+(?:en|jp|fr|de|es|it|pt)$/i, "")
    .replace(/[^a-z0-9]/g, "");
  return compact.replace(/^([a-z]+)0+(\d+)$/, "$1$2");
}

function nameCodePrefix(name: string): string {
  const match = /^\s*([a-z0-9]{2,8})\s*(?::|[-–—|])/i.exec(name);
  return match?.[1] ?? "";
}

function groupHasCode(group: TcgcsvGroup, code: string): boolean {
  const target = normalizeCode(code);
  if (!target) return false;
  const explicitPrefix = nameCodePrefix(group.name);
  return normalizeCode(group.abbreviation) === target || normalizeCode(explicitPrefix) === target;
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function nameCompatible(cardName: string, query: string): boolean {
  const name = normalizedName(cardName);
  const target = normalizedName(query);
  return !!target && (name === target || name.includes(target) || target.includes(name));
}

function numberMatches(cardNumber: string, target: string | undefined): boolean {
  if (!target?.trim()) return false;
  return cardNumber.trim().toLowerCase().replace(/\s+/g, "") === target.trim().toLowerCase().replace(/\s+/g, "");
}

async function loadGroupCards(group: TcgcsvGroup): Promise<TcgResult[] | null> {
  const products = await getProducts(group.groupId);
  if (!products) return null;
  return products
    .map((product) => cardFromProduct(product, group))
    .filter((card): card is TcgResult => card !== null);
}

/**
 * Returns the complete, validated English Pokemon group index. Product lists
 * are deliberately loaded separately so callers can select only relevant sets.
 */
export async function getTcgcsvPokemonGroups(): Promise<TcgcsvPokemonGroup[] | null> {
  return await getGroups();
}

/** Returns only numbered Pokemon, Trainer, and Energy singles from one group. */
export async function getTcgcsvPokemonGroupCards(groupId: number): Promise<TcgResult[] | null> {
  const groups = await getGroups();
  const group = groups?.find((candidate) => candidate.groupId === groupId);
  if (!group) return groups === null ? null : [];
  return await loadGroupCards(group);
}

async function loadCardsBounded(groups: TcgcsvGroup[]): Promise<TcgResult[][] | null> {
  const results: TcgResult[][] = new Array(groups.length);
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(MAX_INFLIGHT_GROUPS, groups.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= groups.length) return;
      const cards = await loadGroupCards(groups[index]!);
      if (cards === null) {
        failed = true;
        return;
      }
      results[index] = cards;
    }
  });
  await Promise.all(workers);
  return failed ? null : results;
}

export async function searchTcgcsv(
  query: string,
  cardNumber?: string,
  setCode?: string,
): Promise<TcgResult[]> {
  try {
    if (!normalizedName(query)) return [];
    const groups = await getGroups();
    if (!groups) return [];
    const hasSetCode = !!setCode?.trim();
    const selectedGroups = hasSetCode
      ? groups.filter((group) => groupHasCode(group, setCode!))
      : groups;
    if (!selectedGroups.length) return [];

    const catalog = await loadCardsBounded(selectedGroups);
    if (!catalog) return [];
    const matchedSetCode = hasSetCode ? normalizeCode(setCode!) : undefined;
    const cards = catalog.flat()
      .filter((card) => nameCompatible(card.name, query))
      .map((card) => matchedSetCode ? { ...card, setId: matchedSetCode } : card);
    return cards.sort((a, b) => {
      const aNumber = numberMatches(a.cardNumber, cardNumber) ? 0 : 1;
      const bNumber = numberMatches(b.cardNumber, cardNumber) ? 0 : 1;
      return aNumber - bNumber;
    });
  } catch {
    return [];
  }
}

export async function getTcgcsvCard(id: string): Promise<TcgResult | null> {
  try {
    const parsedId = parseTcgcsvId(id);
    if (!parsedId) return null;
    const groups = await getGroups();
    const group = groups?.find((candidate) => candidate.groupId === parsedId.groupId);
    if (!group) return null;
    const products = await getProducts(parsedId.groupId);
    const product = products?.find((candidate) => candidate.productId === parsedId.productId);
    return product ? cardFromProduct(product, group) : null;
  } catch {
    return null;
  }
}

function parsePriceRow(value: unknown): PriceRow | null {
  if (!isRecord(value)) return null;
  const productId = strictPositiveInteger(value.productId);
  if (productId == null) return null;
  const groupId = value.groupId == null ? undefined : strictPositiveInteger(value.groupId) ?? undefined;
  const categoryId = value.categoryId == null ? undefined : strictPositiveInteger(value.categoryId) ?? undefined;
  if ((value.groupId != null && groupId == null) || (value.categoryId != null && categoryId == null)) return null;
  if (value.subTypeName != null && typeof value.subTypeName !== "string") return null;
  return {
    productId,
    groupId,
    categoryId,
    subTypeName: typeof value.subTypeName === "string" ? value.subTypeName.trim() : "",
    marketPrice: value.marketPrice,
    lowPrice: value.lowPrice,
    midPrice: value.midPrice,
  };
}

function validPriceNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

async function getPrices(groupId: number): Promise<PriceRow[] | null> {
  return await loadCollection(
    `prices:${groupId}`,
    `${API_ROOT}/${POKEMON_CATEGORY_ID}/${groupId}/prices`,
    PRICE_TTL_MS,
    (value): value is PriceRow => parsePriceRow(value) !== null,
    "static",
  );
}

export async function getTcgcsvPricing(id: string): Promise<PricingData> {
  try {
    const parsedId = parseTcgcsvId(id);
    if (!parsedId || !(await getTcgcsvCard(id))) return { ...EMPTY_PRICING };
    const rows = await getPrices(parsedId.groupId);
    if (!rows) return { ...EMPTY_PRICING };

    const eligible = rows
      .map(parsePriceRow)
      .filter((row): row is PriceRow => row !== null)
      .filter((row) =>
        row.productId === parsedId.productId &&
        (row.groupId === undefined || row.groupId === parsedId.groupId) &&
        (row.categoryId === undefined || row.categoryId === POKEMON_CATEGORY_ID),
      );
    const normalRows = eligible.filter((row) => row.subTypeName.toLowerCase() === "normal");
    const selected = normalRows.length === 1 ? normalRows[0] : normalRows.length === 0 && eligible.length === 1 ? eligible[0] : null;
    if (!selected) return { ...EMPTY_PRICING };

    const marketPrice = validPriceNumber(selected.marketPrice);
    const lowPrice = validPriceNumber(selected.lowPrice);
    const trendPrice = validPriceNumber(selected.midPrice);
    if (marketPrice == null && lowPrice == null && trendPrice == null) return { ...EMPTY_PRICING };
    return {
      marketPrice,
      lowPrice,
      trendPrice,
      source: "tcgplayer",
      psaEstimates: null,
    };
  } catch {
    return { ...EMPTY_PRICING };
  }
}

/**
 * Return every finish row belonging to one exact TCGCSV product. Unlike the
 * legacy pricing helper above, this intentionally does not choose a default
 * finish. Callers must request an exact subtype before using a row.
 */
export async function getTcgcsvPriceVariants(id: string): Promise<Array<{
  finish: string;
  marketPrice: number | null;
  lowPrice: number | null;
  midPrice: number | null;
}>> {
  try {
    const parsedId = parseTcgcsvId(id);
    if (!parsedId || !(await getTcgcsvCard(id))) return [];
    const rows = await getPrices(parsedId.groupId);
    if (!rows) return [];
    return rows
      .map(parsePriceRow)
      .filter((row): row is PriceRow => row !== null)
      .filter((row) =>
        row.productId === parsedId.productId &&
        (row.groupId === undefined || row.groupId === parsedId.groupId) &&
        (row.categoryId === undefined || row.categoryId === POKEMON_CATEGORY_ID),
      )
      .map((row) => ({
        finish: row.subTypeName,
        marketPrice: validPriceNumber(row.marketPrice),
        lowPrice: validPriceNumber(row.lowPrice),
        midPrice: validPriceNumber(row.midPrice),
      }));
  } catch {
    return [];
  }
}
