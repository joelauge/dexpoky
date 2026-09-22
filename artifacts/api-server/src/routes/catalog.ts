import { Router } from "express";
import {
  pwSearch,
  pwGetCard,
  normalizeCatalogCard,
  buildPricingFromCatalog,
  enrichCatalogCardImages,
} from "../lib/pokewallet.js";
import { searchTcgdex } from "./detect-helpers.js";
import { BoundedAsyncCache, normalizeLookupKey, recordLookup } from "../lib/lookup-performance.js";
import { rerankCatalogCandidates } from "../lib/catalog-reranker.js";
import type { NormalizedCatalogCard } from "../lib/pokewallet.js";

const router = Router();
type CatalogPayload = {
  results: NormalizedCatalogCard[];
  source: "pokewallet" | "tcgdex" | "empty";
  rateLimited: boolean;
  remainingHour: number | null;
  enrichmentPending: boolean;
  freshness: { identityTtlSeconds: number; imagesTtlSeconds: number; pricingPolicy: string };
};
const catalogCache = new BoundedAsyncCache<CatalogPayload>(200, 10 * 60 * 1000);

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
 * Primary backend: PokeWallet. Falls back to TCGdex when PokeWallet is rate
 * limited / unavailable so search never returns a hard error to the UI.
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
    const pw = await pwSearch(q, limit);
    if (pw.ok) {
      const deterministic = deterministicCatalogRank(pw.data.results.map(normalizeCatalogCard), q);
      const reranked = await rerankCatalogCandidates(q, deterministic);
      jevStatus = reranked.status;
      const payload: CatalogPayload = {
      results: reranked.results,
      source: "pokewallet",
      rateLimited: false,
      remainingHour: pw.remainingHour,
      enrichmentPending: reranked.results.some((card) => !card.imageUrl),
      freshness: { identityTtlSeconds: 600, imagesTtlSeconds: 86400, pricingPolicy: "Pricing freshness policy is unchanged; values reflect the upstream catalog response." },
      };
      if (payload.enrichmentPending) {
        void enrichCatalogCardImages(payload.results).then((results) => {
          catalogCache.set(key, { ...payload, results, enrichmentPending: false });
        });
      }
      return payload;
    }

    const fallback = await searchTcgdex(q);
    return {
    results: deterministicCatalogRank(fallback.variants.map((v) => ({
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
    })), q).slice(0, limit),
    source: "tcgdex",
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

export default router;
