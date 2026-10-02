import { fetchEbaySoldPricing } from "../routes/detect-helpers.js";
import type { EbaySale, SaleCondition } from "./ebay-comparables.js";
import {
  normalizeCatalogCard,
  pwGetCard,
  pwSearch,
  type PokeWalletCard,
} from "./pokewallet.js";
import {
  getTcgcsvCard,
  getTcgcsvPriceVariants,
} from "./tcgcsv.js";

export type LookupFinish = "normal" | "holofoil" | "reverse_holofoil";
export type PriceSource = "tcgplayer" | "cardmarket" | "ebay";

export interface PriceQuote {
  condition?: SaleCondition;
  verifiedSales?: EbaySale[];
  source: PriceSource;
  label: string;
  status: "available" | "unavailable" | "reference_only";
  amount: number | null;
  currency: "USD" | "EUR";
  valueUsd: number | null;
  basis: string;
  finish: string | null;
  updatedAt: string | null;
  url: string | null;
  reason: string | null;
  eligible: boolean;
}

export interface PriceComparison {
  condition?: SaleCondition;
  card: {
    id: string;
    name: string;
    setName: string | null;
    cardNumber: string | null;
    imageUrl: string | null;
  };
  finish: LookupFinish;
  quotes: PriceQuote[];
  averageUsd: number | null;
  averageSourceCount: number;
  fx: null | { eurToUsd: number; date: string; source: string };
  advice: {
    status: "ready" | "unavailable" | "skipped";
    recommendedOption: "tcgplayer" | "cardmarket" | "ebay" | "average" | "none";
    message: string;
  };
}

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD";
const REQUEST_TIMEOUT_MS = 7_000;
const FX_MAX_AGE_DAYS = 7;
const FX_CACHE_TTL_MS = 60 * 60 * 1000;
const MODEL = "jev-latest";

type Identity = {
  id: string;
  name: string;
  setName: string | null;
  setCode: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  pwCard: PokeWalletCard | null;
  tcgdexId: string | null;
};

type TcgcsvCard = {
  id: string;
  name: string;
  setName?: string | null;
  setId?: string | null;
  cardNumber?: string | null;
  imageUrl?: string | null;
};

type TcgDexDetail = Record<string, unknown> & {
  id?: unknown;
  localId?: unknown;
  name?: unknown;
  image?: unknown;
  set?: unknown;
  variants_detailed?: unknown;
  pricing?: unknown;
};

type FxRate = { eurToUsd: number; date: string; source: string };
let fxCache: { expiresAt: number; value: FxRate } | null = null;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positivePrice(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalized(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

function sameName(a: string | null, b: string | null): boolean {
  return !!a && !!b && normalized(a) === normalized(b);
}

function sameNumber(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const normalizeNumber = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "");
  const left = normalizeNumber(a);
  const right = normalizeNumber(b);
  if (left === right) return true;
  // TCGdex localId omits the denominator printed in forms such as 001/088.
  if (left.includes("/") && right.includes("/")) return false;
  return left.split("/")[0] === right.split("/")[0];
}

function tcgcsvName(value: string): string {
  return value.replace(/\s*[-–—|]\s*\d+(?:\/\d+)?\s*$/, "").trim();
}

function isTcgcsvId(id: string): boolean {
  return /^tcgcsv_[1-9]\d*_[1-9]\d*$/.test(id);
}

function tcgdexCatalogId(id: string): string | null {
  const unwrapped = id.startsWith("tcgdex_") ? id.slice("tcgdex_".length) : id;
  return /^[a-z0-9]+-[a-z0-9]+$/i.test(unwrapped) ? unwrapped : null;
}

function pwIdentity(card: PokeWalletCard): Identity | null {
  if (!record(card) || !record(card.card_info)) return null;
  const rawName = text(card.card_info?.clean_name) ?? text(card.card_info?.name);
  if (!rawName || !text(card.id)) return null;
  const normalizedCard = normalizeCatalogCard(card);
  return {
    id: card.id,
    name: normalizedCard.name === "Unknown card" ? rawName : normalizedCard.name,
    setName: text(card.card_info?.set_name),
    setCode: text(card.card_info?.set_code),
    cardNumber: text(card.card_info?.card_number),
    imageUrl: text(card.image_url) ?? text(card.card_info?.image_url),
    pwCard: card,
    tcgdexId: null,
  };
}

function tcgcsvIdentity(card: TcgcsvCard): Identity {
  return {
    id: card.id,
    name: tcgcsvName(card.name),
    setName: text(card.setName),
    setCode: text(card.setId),
    cardNumber: text(card.cardNumber),
    imageUrl: text(card.imageUrl),
    pwCard: null,
    tcgdexId: null,
  };
}

function tcgdexIdentity(card: TcgDexDetail): Identity | null {
  const set = record(card.set) ? card.set : null;
  const id = text(card.id);
  const name = text(card.name);
  if (!id || !name) return null;
  return {
    id,
    name,
    setName: text(set?.name),
    setCode: text(set?.id),
    cardNumber: text(card.localId),
    imageUrl: text(card.image) ? `${text(card.image)!.replace(/\/$/, "")}/high.webp` : null,
    pwCard: null,
    tcgdexId: id,
  };
}

async function fetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "DexPoky/1.0 (price comparison)" },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.json() as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTcgDexDetail(id: string): Promise<TcgDexDetail | null> {
  const payload = await fetchJson(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`);
  return record(payload) && payload.id === id && text(payload.id) ? payload as TcgDexDetail : null;
}

function exactIdentityMatch(candidate: Identity, identity: Identity): boolean {
  return sameName(candidate.name, identity.name) &&
    sameName(candidate.setName, identity.setName) &&
    sameNumber(candidate.cardNumber, identity.cardNumber);
}

async function enrichPokeWallet(identity: Identity): Promise<PokeWalletCard | null> {
  if (identity.pwCard) return identity.pwCard;
  const query = [identity.name, identity.setName, identity.cardNumber].filter(Boolean).join(" ");
  if (!query) return null;
  const result = await pwSearch(query, 10);
  if (!result.ok || !Array.isArray(result.data.results)) return null;
  const exact = result.data.results.filter((card) => {
    const candidate = pwIdentity(card);
    return candidate !== null && exactIdentityMatch(candidate, identity);
  });
  return exact.length === 1 ? exact[0]! : null;
}

async function enrichTcgDex(identity: Identity): Promise<TcgDexDetail | null> {
  if (identity.tcgdexId) return await fetchTcgDexDetail(identity.tcgdexId);
  if (!identity.setCode || !identity.cardNumber) return null;
  const localId = identity.cardNumber.split("/")[0]!;
  const directId = `${identity.setCode.toLowerCase()}-${localId}`;
  const direct = await fetchTcgDexDetail(directId);
  if (direct) {
    const candidate = tcgdexIdentity(direct);
    if (candidate && exactIdentityMatch(candidate, identity)) return direct;
  }
  return null;
}

async function resolveIdentity(catalogCardId: string): Promise<Identity> {
  const dexId = tcgdexCatalogId(catalogCardId);
  const [pwResult, tcgcsvResult, tcgdexResult] = await Promise.all([
    !isTcgcsvId(catalogCardId) && !dexId
      ? pwGetCard(catalogCardId)
      : Promise.resolve({ ok: false as const, reason: "NOT_FOUND" as const }),
    isTcgcsvId(catalogCardId) ? getTcgcsvCard(catalogCardId) : Promise.resolve(null),
    dexId ? fetchTcgDexDetail(dexId) : Promise.resolve(null),
  ]);
  const pw = pwResult.ok && pwResult.data.id === catalogCardId ? pwIdentity(pwResult.data) : null;
  const csv = tcgcsvResult && tcgcsvResult.id === catalogCardId
    ? tcgcsvIdentity(tcgcsvResult as TcgcsvCard)
    : null;
  const dex = tcgdexResult ? tcgdexIdentity(tcgdexResult) : null;
  const identity = pw ?? csv ?? dex;
  if (!identity) {
    throw new Error(`Unable to resolve card identity for catalog card "${catalogCardId}" from PokeWallet, TCGCSV, or TCGdex.`);
  }
  return identity;
}

function providerFinish(finish: LookupFinish): { pw: string; csv: string } {
  switch (finish) {
    case "normal":
      return { pw: "Normal", csv: "Normal" };
    case "holofoil":
      return { pw: "Holofoil", csv: "Holofoil" };
    case "reverse_holofoil":
      return { pw: "Reverse Holofoil", csv: "Reverse Holofoil" };
  }
}

function exactPwTcgPlayer(card: PokeWalletCard | null, finish: LookupFinish) {
  const requested = providerFinish(finish).pw;
  const prices = card?.tcgplayer?.prices;
  const rows = Array.isArray(prices)
    ? prices.filter((price) => record(price) && price.sub_type_name === requested)
    : [];
  const row = rows.length === 1 ? rows[0] : null;
  return row ? { value: positivePrice(row.market_price), updatedAt: text(row.updated_at), url: text(card?.tcgplayer?.url) } : null;
}

function exactPwCardmarket(card: PokeWalletCard | null, finish: LookupFinish) {
  const variants: Record<LookupFinish, string[]> = {
    normal: ["normal"],
    holofoil: ["holo", "holofoil"],
    reverse_holofoil: ["reverse", "reverse_holo", "reverse_holofoil"],
  };
  const accepted = variants[finish]!;
  const prices = card?.cardmarket?.prices;
  const rows = Array.isArray(prices) ? prices.filter((price) =>
    record(price) &&
      typeof price.variant_type === "string" &&
      accepted.includes(price.variant_type.toLowerCase()),
  ) : [];
  const row = rows.length === 1 ? rows[0] : null;
  return row ? { value: positivePrice(row.trend), updatedAt: text(row.updated_at), url: text(card?.cardmarket?.product_url) } : null;
}

function tcgdexVariants(detail: TcgDexDetail | null): Record<string, unknown>[] {
  if (!Array.isArray(detail?.variants_detailed)) return [];
  return detail.variants_detailed.filter(record);
}

function tcgdexVariantMatches(row: Record<string, unknown>, finish: LookupFinish): boolean {
  const type = text(row.type)?.toLowerCase();
  const accepted: Record<LookupFinish, string[]> = {
    normal: ["normal"],
    holofoil: ["holo", "holofoil"],
    reverse_holofoil: ["reverse", "reverse-holo", "reverse_holofoil"],
  };
  return !!type && accepted[finish]!.includes(type);
}

function tcgdexTcgPlayer(detail: TcgDexDetail | null, finish: LookupFinish) {
  const variants = tcgdexVariants(detail).filter((row) => tcgdexVariantMatches(row, finish));
  if (variants.length !== 1) return null;
  const finishKeys: Record<LookupFinish, string[]> = {
    normal: ["normal"],
    holofoil: ["holofoil", "holo"],
    reverse_holofoil: ["reverseHolofoil", "reverse_holofoil", "reverse-holofoil", "reverse"],
  };
  for (const variant of variants) {
    const pricing = record(variant.pricing) ? variant.pricing : null;
    const tcgplayer = record(pricing?.tcgplayer) ? pricing.tcgplayer : null;
    const raw = tcgplayer ? finishKeys[finish].map((key) => tcgplayer[key]).find(record) : null;
    if (!record(raw)) continue;
    return {
      value: positivePrice(raw.marketPrice),
      updatedAt: text(tcgplayer?.updated),
      url: null,
    };
  }
  return null;
}

function tcgdexCardmarket(detail: TcgDexDetail | null, finish: LookupFinish) {
  const variants = tcgdexVariants(detail).filter((row) => tcgdexVariantMatches(row, finish));
  if (variants.length !== 1) return null;
  const variant = variants[0];
  const pricing = record(variant?.pricing) ? variant.pricing : null;
  const cardmarket = record(pricing?.cardmarket) ? pricing.cardmarket : null;
  if (cardmarket) {
    return {
      value: positivePrice(cardmarket.trend),
      updatedAt: text(cardmarket.updated),
      url: null,
    };
  }
  // The detail-level summary is usable only when its exact detailed variant
  // was selected; do not apply another finish's variant-specific trend.
  return null;
}

function findCsvPrice(
  rows: Awaited<ReturnType<typeof getTcgcsvPriceVariants>>,
  finish: LookupFinish,
) {
  const requested = providerFinish(finish).csv.toLowerCase();
  const matches = rows.filter((row) => row.finish.trim().toLowerCase() === requested);
  if (matches.length !== 1) return null;
  return { value: positivePrice(matches[0]!.marketPrice), updatedAt: null, url: null };
}

function usableDateAgeDays(date: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const dateMs = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(dateMs)) return null;
  if (new Date(dateMs).toISOString().slice(0, 10) !== date) return null;
  const currentDateMs = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Math.floor((currentDateMs - dateMs) / 86_400_000);
  return days < 0 ? null : days;
}

async function fetchFx(): Promise<FxRate | null> {
  if (fxCache && fxCache.expiresAt > Date.now()) return fxCache.value;
  const payload = await fetchJson(FRANKFURTER_URL);
  if (!record(payload) || !record(payload.rates)) return null;
  const rate = positivePrice(payload.rates.USD);
  const date = text(payload.date);
  if (rate == null || rate <= 0 || !date || usableDateAgeDays(date) === null || usableDateAgeDays(date)! > FX_MAX_AGE_DAYS) return null;
  const value = { eurToUsd: rate, date, source: "Frankfurter" };
  fxCache = { expiresAt: Date.now() + FX_CACHE_TTL_MS, value };
  return value;
}

function unavailableQuote(
  source: PriceSource,
  finish: string | null,
  currency: "USD" | "EUR",
  reason: string,
  basis: string,
): PriceQuote {
  return {
    source,
    label: source === "tcgplayer" ? "TCGPlayer" : source === "cardmarket" ? "Cardmarket" : "eBay sold listings",
    status: "unavailable",
    amount: null,
    currency,
    valueUsd: null,
    basis,
    finish,
    updatedAt: null,
    url: null,
    reason,
    eligible: false,
  };
}

function priceQuote(
  source: "tcgplayer" | "cardmarket",
  raw: { value: number | null; updatedAt: string | null; url: string | null } | null,
  finish: LookupFinish,
  fx: FxRate | null,
  basis: string,
): PriceQuote {
  const currency = source === "tcgplayer" ? "USD" : "EUR";
  if (!raw || raw.value == null) {
    return unavailableQuote(source, finish, currency, `No exact ${finish} market value was returned.`, basis);
  }
  if (source === "tcgplayer") {
    return {
      source, label: "TCGPlayer", status: "available", amount: raw.value, currency,
      valueUsd: raw.value, basis, finish, updatedAt: raw.updatedAt, url: raw.url,
      reason: null, eligible: true,
    };
  }
  const converted = fx ? Math.round(raw.value * fx.eurToUsd * 100) / 100 : null;
  return {
    source, label: "Cardmarket", status: "available", amount: raw.value, currency,
    valueUsd: converted, basis, finish, updatedAt: raw.updatedAt, url: raw.url,
    reason: fx ? null : "This Cardmarket price is in EUR. A recent exchange rate is unavailable, so it cannot be compared or averaged in USD.",
    eligible: converted !== null,
  };
}

function eBayQuote(
  result: Awaited<ReturnType<typeof fetchEbaySoldPricing>>,
  finish: LookupFinish,
  condition: SaleCondition,
): PriceQuote {
  const sales = result?.verifiedSales ?? [];
  if (sales.length && sales.every(s => s.finish === finish && s.condition === condition && s.currency === "USD")) {
    const sorted = sales.map(s => s.amount).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const amount = Math.round((sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2) * 100) / 100;
    return {
      source: "ebay", label: "eBay verified comparable sales", status: "available",
      amount, currency: "USD", valueUsd: amount, finish, condition, verifiedSales: sales,
      basis: `Median of ${sales.length} individually verified English raw-card sales in ${condition.replace(/_/g, " ")} condition, within 90 days. Item price only; shipping/tax excluded.`,
      updatedAt: sales.map(s => s.soldAt).sort().at(-1)!, url: result!.searchUrl,
      reason: "Attributes verified from seller-stated listing evidence, not card authentication. Platform market/trend quotes are not condition-specific.",
      eligible: true,
    };
  }
  const basis = "Median of completed eBay listing prices; unverified contextual reference, not a platform market quote.";
  if (!result || positivePrice(result.median) == null) {
    return unavailableQuote("ebay", null, "USD", "No usable completed-sale median was returned.", basis);
  }
  return {
    source: "ebay",
    label: "eBay sold listings",
    status: "reference_only",
    amount: result.median,
    currency: "USD",
    valueUsd: result.median,
    basis,
    finish: null,
    updatedAt: null,
    url: result.searchUrl,
    reason: "No individual sales passed all printing, English language, finish, condition, USD price and date checks. This search median is reference-only and cannot be saved or averaged.",
    eligible: false,
  };
}

type JevAnswer = {
  type?: unknown;
  choice?: unknown;
  confidence?: unknown;
  probabilities?: unknown;
};

const MIN_ADVICE_CONFIDENCE = 0.65;

function adviceMessage(
  option: "tcgplayer" | "cardmarket" | "ebay" | "average" | "none",
  quotes: PriceQuote[],
  averageUsd: number | null,
  fx: FxRate | null,
): string {
  const tcgplayer = quotes.find((quote) => quote.source === "tcgplayer" && quote.eligible);
  const cardmarket = quotes.find((quote) => quote.source === "cardmarket" && quote.eligible);
  const spread = tcgplayer?.valueUsd != null && cardmarket?.valueUsd != null
    ? Math.abs(tcgplayer.valueUsd - cardmarket.valueUsd)
    : null;
  const spreadNote = spread == null
    ? "No second comparable platform quote is available."
    : spread < 0.01
      ? "The two USD figures are nearly aligned."
      : `The two USD figures differ by $${spread.toFixed(2)}.`;

  switch (option) {
    case "ebay":
      return "Use the median of the documented matching raw-card sales. Review each sale's date and seller-stated evidence; these checks do not authenticate the card.";
    case "tcgplayer":
      return tcgplayer
        ? `TCGPlayer's market price is $${tcgplayer.valueUsd!.toFixed(2)} for this finish. Cardmarket's EUR trend is a different measure; ${spreadNote}`
        : "The available marketplace figures do not support a TCGPlayer reference.";
    case "cardmarket":
      return cardmarket
        ? `Cardmarket's recent trend is €${cardmarket.amount!.toFixed(2)} (about $${cardmarket.valueUsd!.toFixed(2)} using the EUR/USD rate dated ${fx?.date ?? "unknown"}). A recent trend is not the same measure as a marketplace market price; ${spreadNote}`
        : "The available marketplace figures do not support a Cardmarket reference.";
    case "average":
      return averageUsd != null && quotes.filter(q => q.eligible).length >= 2
        ? `The compatible figures average $${averageUsd.toFixed(2)}. This mixes market/trend measures with any verified sold-price median, and can hide their spread. Platform quotes are not condition-specific.`
        : "An average needs at least two comparable platform prices.";
    case "none":
      return spread == null
        ? "Use the available exact-finish quote as context; no second comparable platform price is available."
        : `The platform measures differ by $${spread.toFixed(2)}. Compare the market-price and trend measures directly rather than treating them as interchangeable.`;
  }
}

async function advise(
  quotes: PriceQuote[],
  averageUsd: number | null,
  fx: FxRate | null,
): Promise<PriceComparison["advice"]> {
  const eligibleQuotes = quotes.filter((quote) =>
    quote.eligible && quote.valueUsd !== null,
  );
  const independentSourceCount = new Set(eligibleQuotes.map((quote) => quote.source)).size;
  const options = ["none"];
  if (eligibleQuotes.some((quote) => quote.source === "tcgplayer")) options.push("tcgplayer");
  if (eligibleQuotes.some((quote) => quote.source === "cardmarket")) options.push("cardmarket");
  if (eligibleQuotes.some((quote) => quote.source === "ebay")) options.push("ebay");
  if (averageUsd !== null && independentSourceCount >= 2) options.push("average");
  if (options.length === 1) {
    return { status: "skipped", recommendedOption: "none", message: "No exact-finish platform prices can be compared in USD yet." };
  }
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    return { status: "unavailable", recommendedOption: "none", message: "Prices are available, but a reference suggestion is temporarily unavailable." };
  }
  const candidates = eligibleQuotes.map((quote) => ({
    source: quote.source,
    valueUsd: quote.valueUsd,
    finish: quote.finish,
    basis: quote.basis,
  }));
  const descriptions: Record<string, string> = {
    tcgplayer: "Use the exact-finish TCGPlayer USD market price as a single-platform reference.",
    cardmarket: "Use the exact-finish Cardmarket trend, converted to USD with a recent dated rate.",
    ebay: "Use only the individually verified raw-card comparable sold-price median for the selected condition; seller-stated evidence does not authenticate cards.",
    average: "Use the arithmetic mean of at least two distinct eligible platform prices; this summarizes but can hide their spread.",
    none: "Do not favor one option; explain the available measures without implying they are interchangeable.",
  };
  const criteria = Object.fromEntries(options.map((option) => [option, descriptions[option]!]));
  const questions = {
    recommendation: {
      type: "choice",
      instructions: "Choose a helpful reference for a buyer comparing this exact card finish. Distinguish marketplace market prices from recent trend measures; do not treat them as interchangeable or imply a purchase recommendation.",
      criteria,
    },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        state: { exactFinish: quotes[0]?.finish, eligibleQuotes: candidates, averageUsd, permittedOptions: options },
        questions,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const answers: Record<string, unknown> | null =
      record(payload) && record(payload.answers) ? payload.answers : null;
    const answer = answers?.recommendation as JevAnswer | undefined;
    if (!answer || answer.type !== "choice" || typeof answer.choice !== "string" || !options.includes(answer.choice)) {
      throw new Error("Invalid TypeSafe choice answer");
    }
    const confidence = answer.confidence;
    const probabilities = answer.probabilities;
    if (
      typeof confidence !== "number" || !Number.isFinite(confidence) ||
      confidence < MIN_ADVICE_CONFIDENCE || confidence > 1 ||
      !record(probabilities)
    ) throw new Error("Uncertain TypeSafe choice");
    const probabilityKeys = Object.keys(probabilities);
    if (
      probabilityKeys.length !== options.length ||
      options.some((option) => typeof probabilities[option] !== "number" ||
        !Number.isFinite(probabilities[option]) ||
        (probabilities[option] as number) < 0 || (probabilities[option] as number) > 1)
    ) throw new Error("Invalid TypeSafe probability distribution");
    const totalProbability = options.reduce((total, option) => total + (probabilities[option] as number), 0);
    const selectedProbability = probabilities[answer.choice] as number;
    const highestProbability = Math.max(...options.map((option) => probabilities[option] as number));
    if (
      Math.abs(totalProbability - 1) > 0.01 ||
      selectedProbability < 0.6 ||
      selectedProbability + Number.EPSILON < highestProbability
    ) throw new Error("Weak TypeSafe choice");
    const recommendedOption = answer.choice as PriceComparison["advice"]["recommendedOption"];
    return { status: "ready", recommendedOption, message: adviceMessage(recommendedOption, quotes, averageUsd, fx) };
  } catch {
    return { status: "unavailable", recommendedOption: "none", message: "Prices are available, but the reference suggestion is unavailable or too uncertain. Compare the market-price and trend figures directly." };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Takes a one-time market snapshot for a catalog identity and one explicit
 * finish. No price rules or snapshots are persisted by this service.
 */
export async function lookupCardPrices(
  catalogCardId: string,
  finish: LookupFinish,
  condition: SaleCondition = "near_mint",
): Promise<PriceComparison> {
  if (!["normal", "holofoil", "reverse_holofoil"].includes(finish)) {
    throw new Error(`Unsupported finish "${String(finish)}"; expected normal, holofoil, or reverse_holofoil.`);
  }
  const identity = await resolveIdentity(catalogCardId);
  const [pwCard, csvCard, dexDetail, ebayResult] = await Promise.all([
    enrichPokeWallet(identity),
    isTcgcsvId(catalogCardId) ? getTcgcsvCard(catalogCardId) : Promise.resolve(null),
    enrichTcgDex(identity),
    fetchEbaySoldPricing(identity.name, identity.setName ?? undefined, identity.cardNumber ?? undefined, {
      name: identity.name, setName: identity.setName, cardNumber: identity.cardNumber, finish, condition,
    }),
  ]);

  const resolvedCsv = csvCard as TcgcsvCard | null;
  const csvId = isTcgcsvId(catalogCardId) ? catalogCardId : resolvedCsv?.id;
  const csvRows = csvId ? await getTcgcsvPriceVariants(csvId) : [];
  const pwTcg = exactPwTcgPlayer(pwCard, finish);
  const csvTcg = findCsvPrice(csvRows, finish);
  const dexTcg = tcgdexTcgPlayer(dexDetail, finish);
  // These are representations of the same TCGPlayer market, not three
  // independent observations. Prefer PokeWallet's raw finish row, then exact
  // TCGCSV product rows, then exact TCGdex detail as fallback.
  const tcgRaw = pwTcg?.value != null ? pwTcg : csvTcg?.value != null ? csvTcg : dexTcg;
  const tcgBasis = `TCGPlayer USD market price for the exact ${finish} finish.`;

  const pwCm = exactPwCardmarket(pwCard, finish);
  const dexCm = tcgdexCardmarket(dexDetail, finish);
  const cmRaw = pwCm?.value != null ? pwCm : dexCm;
  const cmBasis = `Cardmarket EUR trend for the exact ${finish} finish.`;
  const fx = cmRaw?.value != null ? await fetchFx() : null;
  const quotes = [
    priceQuote("tcgplayer", tcgRaw, finish, fx, tcgBasis),
    priceQuote("cardmarket", cmRaw, finish, fx, cmBasis),
    eBayQuote(ebayResult, finish, condition),
  ];
  const comparable = quotes.filter((quote) => quote.eligible && quote.valueUsd !== null);
  const averageUsd = comparable.length
    ? Math.round(comparable.reduce((sum, quote) => sum + quote.valueUsd!, 0) / comparable.length * 100) / 100
    : null;
  const card = {
    id: identity.id,
    name: identity.name,
    setName: identity.setName,
    cardNumber: identity.cardNumber,
    imageUrl: identity.imageUrl,
  };
  const advice = await advise(quotes, averageUsd, fx);
  return {
    card,
    finish,
    condition,
    quotes,
    averageUsd,
    averageSourceCount: comparable.length,
    fx: cmRaw?.value != null ? fx : null,
    advice,
  };
}