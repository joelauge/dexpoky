import type { Card, CardEdition, PlatformPriceQuote, PriceLookup } from "@workspace/api-client-react";

export type Method = "tcgplayer" | "cardmarket" | "ebay" | "average";
export type Edition = CardEdition;

export const EDITIONS: { value: Edition; label: string }[] = [
  { value: "unknown", label: "Unknown / not recorded" },
  { value: "unlimited", label: "Unlimited" },
  { value: "first_edition", label: "1st Edition" },
  { value: "shadowless", label: "Shadowless" },
  { value: "first_edition_shadowless", label: "1st Edition Shadowless" },
];

export function normText(s?: string | null): string {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function normNumber(s?: string | null): string {
  const head = normText((s ?? "").split("/")[0]);
  const stripped = head.replace(/^0+(?=\d)/, "");
  return stripped;
}

export type TargetMatch = { card: Card; via: "id" | "identity" };

export type TargetCandidates = { targets: TargetMatch[]; identityCandidates: TargetMatch[] };

export function findTargets(
  cards: Card[] | undefined,
  lookup: { id: string; name: string; setName: string | null; cardNumber: string | null },
  edition: Edition = "unknown",
): TargetCandidates {
  if (!cards) return { targets: [], identityCandidates: [] };
  const n = normText(lookup.name);
  const s = normText(lookup.setName);
  const num = normNumber(lookup.cardNumber);
  const targets: TargetMatch[] = [];
  const identityCandidates: TargetMatch[] = [];
  for (const c of cards) {
    let via: TargetMatch["via"] | null = null;
    if (c.catalogCardId === lookup.id) {
      via = "id";
    } else if (n && s && num && normText(c.name) === n && normText(c.setName) === s && normNumber(c.cardNumber) === num) {
      via = "identity";
    }
    if (!via) continue;
    const match = { card: c, via };
    if ((c.edition ?? "unknown") === edition) {
      targets.push(match);
    } else {
      identityCandidates.push(match);
    }
  }
  const byCreation = (a: TargetMatch, b: TargetMatch) =>
    new Date(a.card.createdAt).getTime() - new Date(b.card.createdAt).getTime();
  return { targets: targets.sort(byCreation), identityCandidates: identityCandidates.sort(byCreation) };
}

export const usd = (n: number | null | undefined) =>
  n == null ? "Not set" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
export const native = (q: PlatformPriceQuote) =>
  q.amount == null ? "" : new Intl.NumberFormat("en-US", { style: "currency", currency: q.currency }).format(q.amount);
export const when = (iso?: string | null) => {
  if (!iso) return "Not provided";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "Not provided" : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};

export function methodValue(l: PriceLookup, m: Method): number | null {
  if (m === "average") return l.averageSourceCount >= 2 ? l.averageUsd : null;
  const q = l.quotes.find((x) => x.source === m);
  return q && q.status === "available" && q.eligible ? q.valueUsd : null;
}
export const methodLabel = (m: Method) =>
  m === "tcgplayer" ? "TCGplayer" : m === "cardmarket" ? "Cardmarket" : m === "ebay" ? "Verified eBay sales" : "Compatible average";

export function errMessage(e: unknown): string {
  const x = e as { message?: string; data?: { error?: string } | null };
  return x?.data?.error || x?.message || "Something went wrong.";
}
export const isExpiredErr = (e: unknown) => /expir|stale|410/i.test(errMessage(e)) || (e as { status?: number })?.status === 410;
