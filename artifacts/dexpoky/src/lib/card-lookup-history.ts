import type { ComparableSaleCondition, PriceLookupCard, PriceLookupFinish } from "@workspace/api-client-react";

export const LOOKUP_HISTORY_PAGE_SIZE = 10;
export interface LookupHistoryEntry {
  card: PriceLookupCard;
  finish: PriceLookupFinish;
  condition: ComparableSaleCondition;
  visitedAt: number;
}
export const lookupHistoryStorageKey = (userId: string) => `dexpoky:lookup-history:v1:${userId}`;
const finishes = new Set(["normal", "holofoil", "reverse_holofoil"]);
const conditions = new Set(["mint", "near_mint", "light_played"]);
const nullableText = (value: unknown): string | null => typeof value === "string" ? value.slice(0, 2048) : null;

export function parseLookupHistory(raw: string | null): LookupHistoryEntry[] {
  if (!raw) return [];
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows)) return [];
    const valid: LookupHistoryEntry[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || !row.card || typeof row.card !== "object") continue;
      const { card } = row;
      if (typeof card.id !== "string" || !card.id.trim() || typeof card.name !== "string" || !card.name.trim()) continue;
      if (!finishes.has(row.finish) || !conditions.has(row.condition) ||
        typeof row.visitedAt !== "number" || !Number.isFinite(row.visitedAt) ||
        row.visitedAt <= 0 || row.visitedAt > 8.64e15) continue;
      const image = nullableText(card.imageUrl);
      valid.push({
        card: {
          id: card.id, name: card.name, setName: nullableText(card.setName),
          cardNumber: nullableText(card.cardNumber),
          imageUrl: image && /^(https?:\/\/|\/(?!\/))/.test(image) ? image : null,
        },
        finish: row.finish, condition: row.condition, visitedAt: row.visitedAt,
      });
    }
    valid.sort((a, b) => b.visitedAt - a.visitedAt);
    const seen = new Set<string>();
    return valid.filter(({ card }) => {
      if (seen.has(card.id)) return false;
      seen.add(card.id);
      return true;
    });
  } catch {
    return [];
  }
}

export function addLookupHistory(entries: LookupHistoryEntry[], entry: LookupHistoryEntry): LookupHistoryEntry[] {
  const previous = entries.find(({ card }) => card.id === entry.card.id);
  const updated = { ...entry, card: { ...entry.card, imageUrl: entry.card.imageUrl ?? previous?.card.imageUrl ?? null } };
  return parseLookupHistory(JSON.stringify([updated, ...entries.filter(({ card }) => card.id !== entry.card.id)]));
}

export function lookupHistoryPage(entries: LookupHistoryEntry[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(entries.length / LOOKUP_HISTORY_PAGE_SIZE));
  const page = Math.max(1, Math.min(pageCount, Math.trunc(requestedPage) || 1));
  return { page, pageCount, entries: entries.slice((page - 1) * LOOKUP_HISTORY_PAGE_SIZE, page * LOOKUP_HISTORY_PAGE_SIZE) };
}
