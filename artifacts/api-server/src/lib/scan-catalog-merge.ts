import { rankTcgResults, type TcgResult, type PricingData } from "../routes/detect-helpers.js";

/** Supplement a successful primary catalog too, without borrowing its preview's price. */
export async function mergeScanCatalog(
  primary: { card?: TcgResult | null; variants: TcgResult[]; pricing: PricingData },
  supplemental: TcgResult[],
  evidence: { name: string; cardNumber?: string; setCode?: string },
  loadPricing: (card: TcgResult) => Promise<PricingData>,
) {
  if (!supplemental.length) return primary;
  const variants = rankTcgResults(
    [...primary.variants, ...supplemental],
    evidence.name, evidence.cardNumber, evidence.setCode,
  );
  const card = variants[0] ?? null;
  let pricing = primary.pricing;
  if (card && card.id !== primary.card?.id) {
    try {
      pricing = await loadPricing(card);
    } catch {
      pricing = { marketPrice: null, lowPrice: null, trendPrice: null, source: null, psaEstimates: null };
    }
  }
  return { card, variants, pricing };
}