import { getTcgcsvCardCategory, isTcgcsvId, type TcgcsvCardCategory } from "./tcgcsv.js";
import {
  pwGetCard,
  type PokeWalletCard,
  type PokeWalletResult,
} from "./pokewallet.js";

export interface PortfolioCatalogInput {
  catalogCardId?: string | null;
  setId?: string | null;
  setName?: string | null;
}

export type PortfolioCardCategory = "Pokemon" | "Trainer" | "Energy" | "Unknown";

export type TcgcsvCategoryResolver = (
  catalogCardId: string,
) => Promise<TcgcsvCardCategory | null>;

export type PokeWalletCardResolver = (
  catalogCardId: string,
) => Promise<PokeWalletResult<PokeWalletCard> | null>;

export interface PortfolioMetadataResult {
  years: Map<string, string>;
  types: Map<string, string>;
  pending: boolean;
  unavailable: boolean;
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type CachedResult<T> = { ok: true; value: T } | { ok: false };
type CacheEntry = {
  result: CachedResult<unknown>;
  expiresAt: number;
};

interface Cache {
  get(key: string): CachedResult<unknown> | undefined;
  set(key: string, result: CachedResult<unknown>, ttlMs: number): void;
}

export interface PortfolioMetadataLoaderOptions {
  fetchImpl?: FetchLike;
  now?: () => number;
  maxEntries?: number;
  cacheTtlMs?: number;
  negativeCacheTtlMs?: number;
  requestBudgetMs?: number;
  maxMissesPerRequest?: number;
  concurrency?: number;
  resolveTcgcsvCategory?: TcgcsvCategoryResolver;
  lookupPokeWalletCard?: PokeWalletCardResolver;
}

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_NEGATIVE_CACHE_TTL_MS = 30 * 1000;
const DEFAULT_REQUEST_BUDGET_MS = 5_000;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_MISSES = 40;
const DEFAULT_CONCURRENCY = 4;

function createBoundedCache(maxEntries: number, now: () => number): Cache {
  const entries = new Map<string, CacheEntry>();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        entries.delete(key);
        return undefined;
      }
      entries.delete(key);
      entries.set(key, entry);
      return entry.result;
    },
    set(key, result, ttlMs) {
      entries.delete(key);
      entries.set(key, { result, expiresAt: now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

function normalizedSetName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function catalogCardTcgdexId(catalogCardId: string): string | null {
  const id = catalogCardId.startsWith("tcgdex_")
    ? catalogCardId.slice("tcgdex_".length)
    : catalogCardId;
  // TCGdex card IDs are a set ID followed by a hyphen and local card ID.
  // Other namespaces (including TCGCSV) are deliberately not guessed.
  return /^[a-z0-9.]+-[a-z0-9]+$/i.test(id) ? id : null;
}

function cardCategory(value: unknown): string {
  if (value === "Pokemon" || value === "Trainer" || value === "Energy") return value;
  return "Unknown";
}

function normalizedCardType(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase().replace(/\s+/g, " ")
    : "";
}

function explicitCardCategory(value: unknown): PortfolioCardCategory {
  const type = normalizedCardType(value);
  if (type === "pokemon") return "Pokemon";
  if (["trainer", "tool", "pokemon tool", "supporter", "item", "stadium"].includes(type)) return "Trainer";
  if (["energy", "energies", "basic energy", "basic energies", "special energy", "special energies"].includes(type)) {
    return "Energy";
  }
  return "Unknown";
}

const ELEMENTAL_POKEMON_TYPES = new Set([
  "grass",
  "fire",
  "water",
  "lightning",
  "electric",
  "psychic",
  "fighting",
  "darkness",
  "dark",
  "metal",
  "steel",
  "colorless",
  "dragon",
]);

function hasValidCardNumber(value: unknown): boolean {
  return typeof value === "string" && !!value.trim() &&
    !/^(?:n\/?a|none|unknown|-)$/i.test(value.trim());
}

function pokeWalletCardCategory(card: PokeWalletCard): PortfolioCardCategory {
  const info: unknown = card.card_info;
  if (!isRecord(info)) return "Unknown";
  const cardType = normalizedCardType(info.card_type);
  const knownCategory = explicitCardCategory(cardType);
  if (knownCategory !== "Unknown") return knownCategory;
  if (
    ELEMENTAL_POKEMON_TYPES.has(cardType) &&
    hasValidCardNumber(info.card_number) &&
    typeof info.hp === "string" && !!info.hp.trim() &&
    typeof info.stage === "string" && !!info.stage.trim()
  ) return "Pokemon";
  return "Unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function releaseYear(detail: Record<string, unknown>): string | null {
  if (typeof detail.releaseDate !== "string") return null;
  const match = /^(\d{4})(?:-|$)/.exec(detail.releaseDate.trim());
  return match?.[1] ?? null;
}

function nativeTcgdexSetId(setId: string | null | undefined): string | null {
  if (!setId || setId.startsWith("tcgcsv_")) return null;
  const id = setId.startsWith("tcgdex_") ? setId.slice("tcgdex_".length) : setId;
  return /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(id) ? id : null;
}

function createJsonRequester(fetchImpl: FetchLike, timeoutMs: number) {
  return async (url: string, parentSignal: AbortSignal): Promise<CachedResult<unknown>> => {
    if (parentSignal.aborted) return { ok: false };
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (parentSignal.aborted) return { ok: false };
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false };
      const body: unknown = await response.json();
      return isRecord(body) || Array.isArray(body) ? { ok: true, value: body } : { ok: false };
    } catch {
      return { ok: false };
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  };
}

function cacheKey(prefix: string, value: string): string {
  return `${prefix}:${value}`;
}

export function createPortfolioMetadataLoader(options: PortfolioMetadataLoaderOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const cacheTtlMs = Math.max(1, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
  const negativeCacheTtlMs = Math.max(1, options.negativeCacheTtlMs ?? DEFAULT_NEGATIVE_CACHE_TTL_MS);
  const requestBudgetMs = Math.max(1, options.requestBudgetMs ?? DEFAULT_REQUEST_BUDGET_MS);
  const maxMissesPerRequest = Math.max(1, options.maxMissesPerRequest ?? DEFAULT_MAX_MISSES);
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const resolveTcgcsvCategory = options.resolveTcgcsvCategory ?? getTcgcsvCardCategory;
  const lookupPokeWalletCard = options.lookupPokeWalletCard ?? pwGetCard;
  const cache = createBoundedCache(maxEntries, now);
  const inFlight = new Map<string, Promise<CachedResult<unknown>>>();

  const getCachedOrLoad = <T>(
    key: string,
    load: () => Promise<CachedResult<T>>,
  ): Promise<CachedResult<T>> => {
    const cached = cache.get(key);
    if (cached) return Promise.resolve(cached as CachedResult<T>);
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<CachedResult<T>>;

    const request = load()
      .then((result) => {
        cache.set(key, result, result.ok ? cacheTtlMs : negativeCacheTtlMs);
        return result;
      })
      .catch(() => {
        const failure: CachedResult<T> = { ok: false };
        cache.set(key, failure, negativeCacheTtlMs);
        return failure;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request as Promise<CachedResult<unknown>>);
    return request;
  };

  const requestJson = createJsonRequester(fetchImpl, requestBudgetMs);

  const loadSetIndex = (signal: AbortSignal) => getCachedOrLoad("tcgdex:sets-index", async () => {
    const result = await requestJson(`${TCGDEX_BASE}/sets`, signal);
    if (!result.ok || !Array.isArray(result.value)) return { ok: false };
    const sets = result.value.filter((entry): entry is Record<string, unknown> =>
      isRecord(entry) && typeof entry.id === "string" && typeof entry.name === "string")
      .map((entry) => ({ id: entry.id as string, name: entry.name as string }));
    return { ok: true, value: sets };
  });

  const loadYear = async (
    card: PortfolioCatalogInput,
    signal: AbortSignal,
  ): Promise<CachedResult<string | null>> => {
    const nativeId = nativeTcgdexSetId(card.setId);
    let resolvedId = nativeId;

    if (!resolvedId) {
      const requestedName = typeof card.setName === "string" ? normalizedSetName(card.setName) : "";
      if (!requestedName) return { ok: true, value: null };

      const index = await loadSetIndex(signal);
      if (!index.ok || !Array.isArray(index.value)) return { ok: false };
      const matches = index.value.filter((entry): entry is { id: string; name: string } =>
        isRecord(entry) && typeof entry.id === "string" &&
        typeof entry.name === "string" && normalizedSetName(entry.name) === requestedName);
      if (matches.length !== 1 || typeof matches[0]?.id !== "string") {
        return { ok: true, value: null };
      }
      resolvedId = matches[0].id;
    }
    if (!resolvedId) return { ok: true, value: null };
    if (signal.aborted) return { ok: false };

    return await getCachedOrLoad<string | null>(
      cacheKey("tcgdex:set-detail", resolvedId),
      async () => {
        const detail = await requestJson(
          `${TCGDEX_BASE}/sets/${encodeURIComponent(resolvedId)}`,
          signal,
        );
        if (!detail.ok || !isRecord(detail.value)) return { ok: false };
        return { ok: true, value: releaseYear(detail.value) };
      },
    );
  };

  const loadType = async (catalogId: string, signal: AbortSignal): Promise<CachedResult<string>> => {
    const dexId = catalogCardTcgdexId(catalogId);
    if (dexId) {
      return await getCachedOrLoad<string>(
        cacheKey("tcgdex:card-detail", dexId),
        async () => {
          const detail = await requestJson(
            `${TCGDEX_BASE}/cards/${encodeURIComponent(dexId)}`,
            signal,
          );
          if (!detail.ok || !isRecord(detail.value)) return { ok: false };
          return { ok: true, value: cardCategory(detail.value.category) };
        },
      );
    }
    if (catalogId.startsWith("tcgdex_") || catalogId.startsWith("tcgcsv_")) {
      if (!isTcgcsvId(catalogId)) return { ok: true, value: "Unknown" };
    }
    if (isTcgcsvId(catalogId)) {
      return await getCachedOrLoad<string>(
        cacheKey("tcgcsv:card-category", catalogId),
        async () => {
          if (signal.aborted) return { ok: false };
          const category = await resolveTcgcsvCategory(catalogId);
          if (signal.aborted || category === null) return { ok: false };
          return { ok: true, value: category };
        },
      );
    }
    return await getCachedOrLoad<string>(
      cacheKey("pokewallet:card-category", catalogId),
      async () => {
        if (signal.aborted) return { ok: false };
        const lookup = await lookupPokeWalletCard(catalogId);
        if (signal.aborted || !lookup?.ok) return { ok: false };
        return { ok: true, value: pokeWalletCardCategory(lookup.data) };
      },
    );
  };

  async function loadPortfolioMetadata(
    cards: PortfolioCatalogInput[],
    dimension: string,
  ): Promise<PortfolioMetadataResult> {
    const result: PortfolioMetadataResult = {
      years: new Map(),
      types: new Map(),
      pending: false,
      unavailable: false,
    };

    if (dimension !== "year" && dimension !== "card_type") return result;

    type WorkItem = {
      key: string;
      run: (signal: AbortSignal) => Promise<CachedResult<string | null> | CachedResult<string>>;
      apply: (value: string | null) => void;
    };
    const itemByKey = new Map<string, WorkItem>();

    for (const card of cards) {
      if (dimension === "year") {
        const mapKey = card.setId || card.setName || "";
        if (!mapKey) continue;
        const key = cacheKey("portfolio:year", mapKey);
        if (!itemByKey.has(key)) {
          itemByKey.set(key, {
            key,
            run: (signal) => getCachedOrLoad(key, () => loadYear(card, signal)),
            apply: (value) => {
              if (value && /^\d{4}$/.test(value)) result.years.set(mapKey, value);
            },
          });
        }
      } else if (typeof card.catalogCardId === "string" && card.catalogCardId.length > 0) {
        const catalogId = card.catalogCardId;
        const key = cacheKey("portfolio:type", catalogId);
        result.types.set(catalogId, "Unknown");
        if (!itemByKey.has(key)) {
          itemByKey.set(key, {
            key,
            run: (signal) => getCachedOrLoad(key, () => loadType(catalogId, signal)),
            apply: (value) => result.types.set(catalogId, value ?? "Unknown"),
          });
        }
      }
    }

    const work = [...itemByKey.values()];
    const unresolved = work.filter((item) => !cache.get(item.key));
    const selected = unresolved.slice(0, maxMissesPerRequest);
    if (unresolved.length > selected.length) result.pending = true;

    let nextIndex = 0;
    let deadlineReached = false;
    const requestController = new AbortController();

    const worker = async (): Promise<void> => {
      while (!deadlineReached && !requestController.signal.aborted) {
        const index = nextIndex++;
        if (index >= selected.length) return;
        const item = selected[index]!;
        await item.run(requestController.signal);
      }
    };

    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, () => worker())),
        new Promise<void>((resolve) => {
          budgetTimer = setTimeout(() => {
            deadlineReached = true;
            requestController.abort();
            resolve();
          }, requestBudgetMs);
        }),
      ]);
    } finally {
      if (budgetTimer) clearTimeout(budgetTimer);
      if (!requestController.signal.aborted) requestController.abort();
    }

    for (const item of work) {
      const cached = cache.get(item.key);
      if (!cached) {
        if (selected.includes(item)) result.pending = true;
        continue;
      }
      if (!cached.ok) {
        result.unavailable = true;
        continue;
      }
      item.apply(cached.value as string | null);
    }

    return result;
  }

  return { loadPortfolioMetadata };
}

const defaultLoader = createPortfolioMetadataLoader();

export async function loadPortfolioMetadata(
  cards: PortfolioCatalogInput[],
  dimension: string,
): Promise<PortfolioMetadataResult> {
  try {
    return await defaultLoader.loadPortfolioMetadata(cards, dimension);
  } catch {
    return {
      years: new Map(),
      types: dimension === "card_type"
        ? new Map(cards.flatMap((card) => typeof card.catalogCardId === "string" && card.catalogCardId
          ? [[card.catalogCardId, "Unknown"] as const]
          : []))
        : new Map(),
      pending: false,
      unavailable: true,
    };
  }
}