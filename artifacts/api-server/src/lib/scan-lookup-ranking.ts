import type { PricingData } from "../routes/detect-helpers.js";
import { orderScanPrintings, type ScanPrintingEvaluation } from "./scan-printing-selection.js";

const emptyPricing = (): PricingData => ({
  marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null,
});

/** Ranking chooses a preview, not permission to claim that it is the exact card. */
export async function resolveRankedScan<T extends { id: string }>(
  base: { card?: T | null; variants: T[]; pricing: PricingData },
  evaluation: ScanPrintingEvaluation,
  loadPricing: (card: T) => Promise<PricingData>,
) {
  const variants = orderScanPrintings(base.variants, evaluation);
  const card = variants[0] ?? null;
  let pricing = card ? base.pricing : emptyPricing();
  if (card && card.id !== base.card?.id) {
    // This applies to uncertain previews too: no new identity may inherit the
    // previous identity's price. Failed exact-ID pricing is explicitly empty.
    try {
      pricing = await loadPricing(card);
    } catch {
      pricing = emptyPricing();
    }
  }
  const { rankedIds: _internalOrdering, ...selection } = evaluation;
  return { card, variants, pricing, selection };
}