import { isGradedSlabListingTitle } from "./grading.js";

export type SaleCondition = "mint" | "near_mint" | "light_played";
export interface EbaySale {
  itemId: string;
  title: string;
  url: string;
  soldAt: string;
  amount: number;
  currency: "USD";
  finish: string;
  condition: SaleCondition;
  evidence: string;
}
export interface EbayTarget {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  finish: string;
  condition: SaleCondition;
}

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function normalized(s: string): string {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function contains(title: string, phrase: string): boolean {
  return (` ${normalized(title)} `).includes(` ${normalized(phrase)} `);
}
const CONDITIONS: Record<SaleCondition, RegExp> = {
  mint: /\bmint\b/i,
  near_mint: /\b(?:near[\s-]mint|nm)\b/i,
  light_played: /\b(?:lightly[\s-]played|lp)\b/i,
};

/**
 * Fail-closed verification of seller-stated attributes on an individual sold
 * result, not verification of authenticity. Never infer an attribute from the
 * search query. Only explicit English raw single-card sales in the requested
 * condition qualify. Best-offer amounts, ranges and converted currencies are
 * not actual comparable sale prices. Missing/new markup fails closed.
 */
export function verifiedEbaySales(html: string, target: EbayTarget, now = new Date()): EbaySale[] {
  if (!target.setName || !target.cardNumber) return [];
  const sales: EbaySale[] = [];
  const seen = new Set<string>();
  const blocks = html.split(/<li\b[^>]*class=["'][^"']*\bs-item\b[^"']*["'][^>]*>/i).slice(1);
  for (const raw of blocks) {
    // Bound evidence to a single item: never borrow a date/price from another row.
    const block = raw.split(/<\/li>/i)[0]!;
    const title = plain(block.match(/class=["']s-item__title[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|h3)>/i)?.[1] ?? "");
    if (!contains(title, target.name) || !contains(title, target.setName)) continue;
    if (isGradedSlabListingTitle(title) || /\b(?:graded|slab|lot|bundle|pair|playset|pack|sealed|proxy|replica|custom|reprint|jumbo|oversized|world championship|first edition|1st|shadowless|error|misprint|stamped|stamp|promo|japanese|german|french|italian|spanish|korean|chinese)\b|\b\d+\s*(?:cards|pcs|copies)\b|\bx\s*\d+\b|\b\d+\s*x\b/i.test(title)) continue;
    if (!/\b(?:english|eng)\b/i.test(title)) continue;
    // Do not accept a matching substring with an extra Pokémon suffix, another
    // set/edition, an uncertain condition, or other unrecognized qualifiers.
    // Conservative coverage is intentional: ambiguous titles stay reference-only.
    let remainder = ` ${normalized(title)} `;
    for (const phrase of [target.name, target.setName]) {
      remainder = remainder.replace(` ${normalized(phrase)} `, " ");
    }
    remainder = remainder.replace(/\b[a-z]*\d+\s+[a-z]*\d+\b/g, " ");
    const allowedWords = new Set(["pokemon", "tcg", "card", "raw", "english", "eng", "near", "mint", "nm", "lightly", "played", "lp", "holo", "holofoil", "foil", "reverse", "normal", "non", "unlimited"]);
    if (remainder.trim().split(/\s+/).some(word => word && !allowedWords.has(word))) continue;
    // Vintage sets have catalog identities that do not establish edition.
    // Require explicit Unlimited, rather than silently pricing 1st/shadowless.
    if (/\b(?:base set|jungle|fossil|team rocket|gym|neo)\b/i.test(target.setName) && !/\bunlimited\b/i.test(title)) continue;
    const numbers = [...title.matchAll(/\b([a-z]*\d+)\s*\/\s*([a-z]*\d+)\b/gi)];
    const normNum = (s: string) => s.toLowerCase().replace(/^0+(?=\d)/, "");
    const expected = target.cardNumber.replace(/\s/g, "").split("/");
    if (numbers.length !== 1 || normNum(numbers[0]![1]!) !== normNum(expected[0]!)
      || (expected[1] && normNum(numbers[0]![2]!) !== normNum(expected[1]))) continue;
    const reverse = /\breverse[\s-](?:holo(?:foil)?|foil)\b/i.test(title);
    const normal = /\b(?:non[\s-]holo(?:foil)?|non[\s-]foil|normal)\b/i.test(title);
    const holo = !reverse && !normal && /\b(?:holo(?:foil)?|foil)\b/i.test(title);
    const finish = reverse && !normal ? "reverse_holofoil" : normal && !reverse ? "normal" : holo ? "holofoil" : null;
    if (finish !== target.finish) continue;
    const finishMentions = title.match(/\breverse[\s-](?:holo(?:foil)?|foil)\b|\bnon[\s-](?:holo(?:foil)?|foil)\b|\bnormal\b|\bholo(?:foil)?\b|\bfoil\b/gi) ?? [];
    if (finishMentions.length !== 1) continue;
    const conditionText = title.replace(/\bnear[\s-]mint\b/gi, "NM");
    const conditions = (Object.keys(CONDITIONS) as SaleCondition[]).filter(c => CONDITIONS[c].test(conditionText));
    if (conditions.length !== 1 || conditions[0] !== target.condition
      || /\b(?:nm\s*[/-]\s*(?:m|mint|lp)|mint\s*[/-]\s*nm|excellent|good|poor|creased|crease|scratch|played)\b/i.test(
        conditionText.replace(/\blightly[\s-]played\b/gi, ""),
      )) continue;
    const visible = plain(block);
    if (/\b(?:best offer|offer accepted|to|lot|bundle|graded|slab|psa|bgs|cgc|sgc|tag)\b/i.test(visible)) continue;
    const price = plain(block.match(/class=["']s-item__price[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    // US $ explicitly, or the bare $ on the US site with no conflicting currency.
    if (!/^(?:US\s*)?\$\s*\d[\d,]*\.\d{2}$/.test(price) || /\b(?:CAD|AUD|C\s*\$|AU\s*\$|EUR|GBP)\b|[€£]/i.test(visible)) continue;
    const amount = Number(price.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) continue;
    const dateText = visible.match(/\bSold\s+([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\b/)?.[1];
    const timestamp = dateText ? Date.parse(`${dateText} 00:00:00 UTC`) : NaN;
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() || now.getTime() - timestamp > 90 * 86400_000) continue;
    const soldAt = new Date(timestamp).toISOString().slice(0, 10);
    const canonicalDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(timestamp));
    if (canonicalDate !== dateText) continue;
    const link = block.match(/href=["'](https:\/\/(?:www\.)?ebay\.com\/itm\/[^"']+)["']/i)?.[1];
    if (!link) continue;
    const itemId = new URL(link.replace(/&amp;/g, "&")).pathname.match(/\/(\d{9,15})(?:\/|$)/)?.[1];
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    sales.push({
      itemId, title, url: `https://www.ebay.com/itm/${itemId}`, soldAt, amount, currency: "USD", finish,
      condition: target.condition,
      evidence: "Seller title explicitly matches name, set, printed number, English language, finish and raw condition; sold row supplies USD item price and sale date. Shipping/tax excluded. Seller claims, not authentication.",
    });
  }
  return sales;
}