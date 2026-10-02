import type { Card, PlatformPriceQuote, PriceLookup } from "@workspace/api-client-react";

export type Method = "tcgplayer" | "cardmarket" | "average";

export function normText(s?: string | null): string {
  return (s ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function normNumber(s?: string | null): string {
  const head = normText((s ?? "").split("/")[0]);
  const stripped = head.replace(/^0+(?=\d)/, "");
  return stripped;
}

export type TargetMatch = { card: Card; via: "id" | "identity" };

export function findTargets(
  cards: Card[] | undefined,
  lookup: { id: string; name: string; setName: string | null; cardNumber: string | null },
): TargetMatch[] {
  if (!cards) return [];
  const n = normText(lookup.name);
  const s = normText(lookup.setName);
  const num = normNumber(lookup.cardNumber);
  const out: TargetMatch[] = [];
  for (const c of cards) {
    if (c.catalogCardId === lookup.id) {
      out.push({ card: c, via: "id" });
      continue;
    }
    if (n && s && num && normText(c.name) === n && normText(c.setName) === s && normNumber(c.cardNumber) === num) {
      out.push({ card: c, via: "identity" });
    }
  }
  return out.sort((a, b) => new Date(a.card.createdAt).getTime() - new Date(b.card.createdAt).getTime());
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
  m === "tcgplayer" ? "TCGplayer" : m === "cardmarket" ? "Cardmarket" : "Compatible average";

export function errMessage(e: unknown): string {
  const x = e as { message?: string; data?: { error?: string } | null };
  return x?.data?.error || x?.message || "Something went wrong.";
}
export const isExpiredErr = (e: unknown) => /expir|stale|410/i.test(errMessage(e)) || (e as { status?: number })?.status === 410;
