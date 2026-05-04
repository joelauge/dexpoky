import { Router } from "express";
import {
  pwSearch,
  pwGetCard,
  normalizeCatalogCard,
  buildPricingFromCatalog,
  enrichCatalogCardImages,
} from "../lib/pokewallet.js";
import { searchTcgdex } from "./detect-helpers.js";

const router = Router();

/**
 * GET /catalog/search?q=charizard&limit=20
 *
 * Primary backend: PokeWallet. Falls back to TCGdex when PokeWallet is rate
 * limited / unavailable so search never returns a hard error to the UI.
 */
router.get("/catalog/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 20) || 20));
  if (!q) {
    res.json({ results: [], source: "empty", rateLimited: false, remainingHour: null });
    return;
  }

  const pw = await pwSearch(q, limit);
  if (pw.ok) {
    const normalized = pw.data.results.map(normalizeCatalogCard);
    const enriched = await enrichCatalogCardImages(normalized);
    res.json({
      results: enriched,
      source: "pokewallet",
      rateLimited: false,
      remainingHour: pw.remainingHour,
    });
    return;
  }

  // Fallback to TCGdex when PokeWallet is unavailable
  const fallback = await searchTcgdex(q);
  res.json({
    results: fallback.variants.map((v) => ({
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
    })),
    source: "tcgdex",
    rateLimited: pw.reason === "RATE_LIMITED",
    remainingHour: null,
  });
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
