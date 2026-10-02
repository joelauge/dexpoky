import { Router } from "express";
import {
  pwSearch,
  pwGetCard,
  normalizeCatalogCard,
  buildPricingFromCatalog,
  enrichCatalogCardImages,
  extractPokemonName,
} from "../lib/pokewallet.js";
import { searchTcgdex, type TcgResult } from "./detect-helpers.js";
import { getTcgcsvCard, getTcgcsvPricing, isTcgcsvId, searchTcgcsv } from "../lib/tcgcsv.js";
import { BoundedAsyncCache, normalizeLookupKey, recordLookup } from "../lib/lookup-performance.js";
import { rerankCatalogCandidates } from "../lib/catalog-reranker.js";
import type { NormalizedCatalogCard } from "../lib/pokewallet.js";
import { EnsureSetCatalogCardBody, EnsureSetCatalogCardResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import {
  CatalogVerificationUnavailable,
  ensureSetCatalogCard,
} from "../lib/pokemon-set-card-supplements.js";

const router = Router();
type CatalogPayload = {
  results: NormalizedCatalogCard[];
  source: "pokewallet" | "tcgdex" | "tcgcsv" | "mixed" | "empty";
  rateLimited: boolean;
  remainingHour: number | null;
  enrichmentPending: boolean;
  freshness: { identityTtlSeconds: number; imagesTtlSeconds: number; pricingPolicy: string };
};
const catalogCache = new BoundedAsyncCache<CatalogPayload>(200, 10 * 60 * 1000);

function normalizeTcgcsvCard(card: TcgResult, marketPrice: number | null): NormalizedCatalogCard {
  return {
    id: card.id,
    name: card.name,
    pokemonName: extractPokemonName(card.name),
    setName: card.setName ?? "",
    setCode: card.setId ?? "",
    cardNumber: card.cardNumber ?? "",
    rarity: card.rarity ?? null,
    imageUrl: card.imageUrl ?? "",
    marketPrice,
    tcgplayerUrl: null,
    cardmarketUrl: null,
  };
}

function catalogSearchHints(query: string): { name: string; cardNumber?: string; setCode?: string } {
  const q = query.trim();
  const codeAndNumber = q.match(/(?:^|\s)([a-z0-9]{2,8})[-#]([a-z]{0,4}\d{1,4}(?:\/\d{1,4})?|\d{1,4}(?:\/\d{1,4})?)\s*$/i);
  if (codeAndNumber?.index != null) {
    return {
      name: q.slice(0, codeAndNumber.index).trim() || q,
      setCode: codeAndNumber[1],
      cardNumber: codeAndNumber[2],
    };
  }

  const tokens = q.split(/\s+/);
  const numberToken = tokens[tokens.length - 1] ?? "";
  const codeToken = tokens[tokens.length - 2] ?? "";
  if (
    tokens.length > 2 &&
    /^[a-z]{0,4}\d{1,4}(?:\/\d{1,4})?$/i.test(numberToken) &&
    /^[A-Z0-9]{2,8}$/.test(codeToken) &&
    codeToken !== codeToken.toLowerCase()
  ) {
    return {
      name: tokens.slice(0, -2).join(" "),
      setCode: codeToken,
      cardNumber: numberToken,
    };
  }

  const numberMatch = q.match(/(?:#\s*|\s+)([a-z]{0,4}\d{1,4}(?:\/\d{1,4})?|\d{1,4}(?:\/\d{1,4})?)\s*$/i);
  return numberMatch?.index != null
    ? { name: q.slice(0, numberMatch.index).trim() || q, cardNumber: numberMatch[1] }
    : { name: q };
}

function queryCardNumber(query: string): string | undefined {
  return catalogSearchHints(query).cardNumber;
}

function sameRequestedNumber(cardNumber: string, requested: string): boolean {
  const normalizePart = (part: string | undefined) => part?.replace(/^0+(?=\d)/, "").toLowerCase();
  const actual = cardNumber.split("/");
  const wanted = requested.split("/");
  if (!normalizePart(actual[0]) || normalizePart(actual[0]) !== normalizePart(wanted[0])) return false;
  return !wanted[1] || (!!actual[1] && normalizePart(actual[1]) === normalizePart(wanted[1]));
}

function buildCatalogCandidateUnion(
  primary: NormalizedCatalogCard[],
  supplemental: NormalizedCatalogCard[],
  query: string,
): NormalizedCatalogCard[] {
  const primaryIds = new Set<string>();
  const uniquePrimary = primary.filter((card) => {
    if (primaryIds.has(card.id)) return false;
    primaryIds.add(card.id);
    return true;
  });
  const seenSupplemental = new Set<string>();
  const allSupplemental = supplemental.filter((card) => {
    if (primaryIds.has(card.id) || seenSupplemental.has(card.id)) return false;
    seenSupplemental.add(card.id);
    return true;
  });
  const requestedNumber = queryCardNumber(query);
  if (requestedNumber) {
    allSupplemental.sort((a, b) =>
      Number(sameRequestedNumber(b.cardNumber, requestedNumber)) -
      Number(sameRequestedNumber(a.cardNumber, requestedNumber)));
  }
  return [...uniquePrimary, ...allSupplemental];
}

function limitCatalogResults(
  candidates: NormalizedCatalogCard[],
  query: string,
  limit: number,
): NormalizedCatalogCard[] {
  const primary = candidates.filter((card) => !card.id.startsWith("tcgcsv_"));
  const supplemental = candidates.filter((card) => card.id.startsWith("tcgcsv_"));
  const requestedNumber = queryCardNumber(query);
  if (requestedNumber) {
    supplemental.sort((a, b) =>
      Number(sameRequestedNumber(b.cardNumber, requestedNumber)) -
      Number(sameRequestedNumber(a.cardNumber, requestedNumber)));
  }
  const supplementSlots = Math.min(supplemental.length, Math.max(1, Math.ceil(limit / 4), limit - primary.length));
  const primarySlots = Math.max(0, limit - supplementSlots);
  const selectedIds = new Set([
    ...primary.slice(0, primarySlots).map((card) => card.id),
    ...supplemental.slice(0, supplementSlots).map((card) => card.id),
  ]);
  return candidates.filter((card) => selectedIds.has(card.id));
}

async function priceSelectedTcgcsvCards(
  cards: NormalizedCatalogCard[],
  onError: (cardId: string, error: unknown) => void,
): Promise<NormalizedCatalogCard[]> {
  const results = [...cards];
  const tcgcsvIndexes = results
    .map((card, index) => card.id.startsWith("tcgcsv_") ? index : -1)
    .filter((index) => index >= 0);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(5, tcgcsvIndexes.length) }, async () => {
    while (cursor < tcgcsvIndexes.length) {
      const index = tcgcsvIndexes[cursor++]!;
      const card = results[index]!;
      try {
        const pricing = await getTcgcsvPricing(card.id);
        results[index] = { ...card, marketPrice: pricing.marketPrice ?? null };
      } catch (err) {
        onError(card.id, err);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function catalogResultSource(
  primarySource: "pokewallet" | "tcgdex",
  results: NormalizedCatalogCard[],
): CatalogPayload["source"] {
  const hasTcgcsv = results.some((card) => card.id.startsWith("tcgcsv_"));
  const hasPrimary = results.some((card) => !card.id.startsWith("tcgcsv_"));
  if (hasTcgcsv && hasPrimary) return "mixed";
  if (hasTcgcsv) return "tcgcsv";
  return primarySource;
}

export function deterministicCatalogRank(cards: NormalizedCatalogCard[], query: string): NormalizedCatalogCard[] {
  const q = query.toLowerCase().trim();
  const compact = q.replace(/[^a-z0-9]/g, "");
  return cards.map((card, index) => {
    const setNumber = `${card.setCode}${card.cardNumber}`.toLowerCase().replace(/[^a-z0-9]/g, "");
    const exactIdentity = compact.length > 2 && compact === setNumber;
    const exactName = card.name.toLowerCase() === q || card.pokemonName.toLowerCase() === q;
    const prefix = card.name.toLowerCase().startsWith(q) || card.pokemonName.toLowerCase().startsWith(q);
    return { card, index, score: exactIdentity ? 0 : exactName ? 1 : prefix ? 2 : 3 };
  }).sort((a, b) => a.score - b.score || a.index - b.index).map(({ card }) => card);
}

/**
 * GET /catalog/search?q=charizard&limit=20
 *
 * Primary backend: PokeWallet. TCGCSV supplements all searches; TCGdex remains
 * the fallback when PokeWallet is unavailable.
 */
router.get("/catalog/search", async (req, res) => {
  const startedAt = performance.now();
  const q = String(req.query.q ?? "").trim();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 20) || 20));
  if (!q) {
    res.json({ results: [], source: "empty", rateLimited: false, remainingHour: null, enrichmentPending: false,
      freshness: { identityTtlSeconds: 600, imagesTtlSeconds: 86400, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." } });
    return;
  }

  const key = normalizeLookupKey(q, limit);
  const alreadyCached = catalogCache.get(key);
  if (alreadyCached) {
    recordLookup("catalog", performance.now() - startedAt, { cache: "hit", jev: "skipped" });
    res.json(alreadyCached);
    return;
  }
  const externalStartedAt = performance.now();
  let jevStatus: "invoked" | "fallback" | "skipped" = "skipped";
  const loaded = await catalogCache.getOrLoad(key, async () => {
    const hints = catalogSearchHints(q);
    const [pw, tcgcsvResults] = await Promise.all([
      pwSearch(q, limit),
      searchTcgcsv(hints.name, hints.cardNumber, hints.setCode).catch((err) => {
        req.log?.warn({ err }, "TCGCSV catalog search failed");
        return [] as TcgResult[];
      }),
    ]);
    const tcgcsvCards = tcgcsvResults.map((card) => normalizeTcgcsvCard(card, null));
    if (pw.ok) {
      const union = buildCatalogCandidateUnion(
        pw.data.results.map(normalizeCatalogCard),
        tcgcsvCards,
        q,
      );
      const deterministic = deterministicCatalogRank(union, q);
      const reranked = await rerankCatalogCandidates(q, deterministic);
      jevStatus = reranked.status;
      const selected = limitCatalogResults(reranked.results, q, limit);
      const results = await priceSelectedTcgcsvCards(selected, (id, err) => {
        req.log?.warn({ err, id }, "TCGCSV catalog pricing failed");
      });
      const payload: CatalogPayload = {
        results,
        source: catalogResultSource("pokewallet", results),
        rateLimited: false,
        remainingHour: pw.remainingHour,
        enrichmentPending: results.some((card) => card.id.startsWith("pk_") && !card.imageUrl),
        freshness: { identityTtlSeconds: 600, imagesTtlSeconds: 86400, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
      };
      if (payload.enrichmentPending) {
        const pokewalletCards = results.filter((card) => card.id.startsWith("pk_"));
        void enrichCatalogCardImages(pokewalletCards).then((enrichedCards) => {
          const enrichedById = new Map(enrichedCards.map((card) => [card.id, card]));
          const enrichedResults = payload.results.map((card) => enrichedById.get(card.id) ?? card);
          catalogCache.set(key, { ...payload, results: enrichedResults, enrichmentPending: false });
        });
      }
      return payload;
    }

    const fallback = await searchTcgdex(q);
    const tcgdexCards = deterministicCatalogRank(fallback.variants.map((v) => ({
      id: v.id,
      name: v.name,
      pokemonName: v.name,
      setName: v.setName,
      setCode: v.setId,
      cardNumber: v.cardNumber,
      rarity: v.rarity,
      imageUrl: v.imageUrl,
      marketPrice: null,
      tcgplayerUrl: null,
      cardmarketUrl: null,
    })), q);
    const union = buildCatalogCandidateUnion(tcgdexCards, tcgcsvCards, q);
    const selected = limitCatalogResults(union, q, limit);
    const results = await priceSelectedTcgcsvCards(selected, (id, err) => {
      req.log?.warn({ err, id }, "TCGCSV catalog pricing failed");
    });
    return {
      results,
      source: catalogResultSource("tcgdex", results),
      rateLimited: pw.reason === "RATE_LIMITED",
      remainingHour: null,
      enrichmentPending: false,
      freshness: { identityTtlSeconds: 600, imagesTtlSeconds: 86400, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
    };
  });
  recordLookup("catalog", performance.now() - startedAt, {
    cache: loaded.status,
    externalMs: loaded.status === "miss" ? performance.now() - externalStartedAt : undefined,
    jev: jevStatus,
  });
  res.json(loaded.value);
});

/**
 * GET /catalog/cards/:id
 *
 * Returns the normalized catalog card + pricing breakdown. Prefers PokeWallet
 * but falls back to TCGdex+PTCG.io pricing when the catalog can't help.
 */
router.get("/catalog/cards/:id", async (req, res) => {
  const id = String(req.params.id ?? "").trim();
  if (!id) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  if (id.startsWith("tcgcsv_")) {
    if (!isTcgcsvId(id)) {
      res.status(404).json({ error: "Catalog card not found" });
      return;
    }
    const card = await getTcgcsvCard(id);
    if (!card) {
      res.status(404).json({ error: "Catalog card not found" });
      return;
    }
    const pricing = await getTcgcsvPricing(id);
    res.json({
      card: normalizeTcgcsvCard(card, pricing.marketPrice ?? null),
      pricing,
    });
    return;
  }

  const pw = await pwGetCard(id);
  if (pw.ok) {
    const [enriched] = await enrichCatalogCardImages([normalizeCatalogCard(pw.data)]);
    res.json({
      card: enriched,
      pricing: buildPricingFromCatalog(pw.data),
    });
    return;
  }

  if (pw.reason === "NOT_FOUND") {
    res.status(404).json({ error: "Catalog card not found" });
    return;
  }

  // PokeWallet rate limited / missing key → return 503 so the client can
  // gracefully fall back to its scan-pricing path.
  res.status(503).json({ error: "Catalog temporarily unavailable" });
});

router.post("/catalog/ensure-set-card", requireAuth, async (req, res) => {
  const parsed = EnsureSetCatalogCardBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Provide only a valid catalogCardId." });
    return;
  }
  try {
    const outcome = await ensureSetCatalogCard(parsed.data.catalogCardId);
    res.json(EnsureSetCatalogCardResponse.parse(outcome));
  } catch (error) {
    if (error instanceof CatalogVerificationUnavailable) {
      req.log?.warn({ err: error }, "Set checklist catalog verification unavailable");
    } else {
      req.log?.error({ err: error }, "Set checklist supplement failed");
    }
    res.status(503).json({
      error: "This catalog printing could not be verified safely. The checklist was not changed; try again later.",
    });
  }
});

export default router;
