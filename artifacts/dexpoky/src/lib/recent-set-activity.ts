import type { PokemonSetSummary } from "@workspace/api-client-react";
import { normalizeSetCardValue } from "./set-completion";

export const MAX_SET_VISITS = 30;
export const RECENT_SET_LIMIT = 6;
export const setVisitStorageKey = (userId: string) => `dexpoky:recent-sets:${userId}`;

export type SetVisit = { setId: string; visitedAt: number };
export type RecentSetActivity = {
  set: PokemonSetSummary;
  activityAt: number;
  kind: "visited" | "added" | "updated";
};
type ActivityCard = {
  setId?: string | null;
  setName?: string | null;
  catalogCardId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parseSetVisits(raw: string | null): SetVisit[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    const byId = new Map<string, number>();
    for (const entry of data) {
      if (!entry || typeof entry !== "object") continue;
      const { setId, visitedAt } = entry as Partial<SetVisit>;
      if (typeof setId !== "string" || !setId.trim() || setId.length > 200 ||
          typeof visitedAt !== "number" || !Number.isFinite(visitedAt) || visitedAt <= 0 ||
          !Number.isFinite(new Date(visitedAt).getTime())) continue;
      byId.set(setId, Math.max(byId.get(setId) ?? 0, visitedAt));
    }
    return [...byId].map(([setId, visitedAt]) => ({ setId, visitedAt }))
      .sort((a, b) => b.visitedAt - a.visitedAt).slice(0, MAX_SET_VISITS);
  } catch {
    return [];
  }
}

export function addSetVisit(visits: SetVisit[], setId: string, visitedAt = Date.now()): SetVisit[] {
  return parseSetVisits(JSON.stringify([...visits, { setId, visitedAt }]));
}

/** Reuse summary namespaces only; never fetch a set's full card catalog for this row. */
export function getRecentSetActivity(
  sets: PokemonSetSummary[],
  cards: ActivityCard[],
  visits: SetVisit[],
  limit = RECENT_SET_LIMIT,
): RecentSetActivity[] {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const byName = new Map<string, PokemonSetSummary | null>();
  for (const set of sets) {
    for (const alias of set.catalogSetIds ?? []) {
      if (!byId.has(alias)) byId.set(alias, set);
    }
    const name = normalizeSetCardValue(set.name);
    if (name) byName.set(name, byName.has(name) ? null : set);
  }
  const recent = new Map<string, RecentSetActivity>();
  const remember = (set: PokemonSetSummary | undefined | null, activityAt: number, kind: RecentSetActivity["kind"]) => {
    if (!set || !Number.isFinite(activityAt) || activityAt <= 0) return;
    const previous = recent.get(set.id);
    if (!previous || activityAt > previous.activityAt) recent.set(set.id, { set, activityAt, kind });
  };
  for (const visit of visits) remember(byId.get(visit.setId), visit.visitedAt, "visited");
  for (const card of cards) {
    // A namespaced catalog identity is authoritative; do not remap an unrelated printing by name.
    const catalogId = card.catalogCardId ?? "";
    const catalogSetId = catalogId.match(/^tcgcsv_(\d+)_\d+$/)?.[1];
    const tcgdexSetId = catalogId.match(/^([a-z][a-z0-9.]*)-[a-z0-9]+$/i)?.[1];
    const set = catalogSetId
      ? byId.get(`tcgcsv_${catalogSetId}`)
      : tcgdexSetId
        ? byId.get(tcgdexSetId)
        : (card.setId ? byId.get(card.setId) : undefined) ?? byName.get(normalizeSetCardValue(card.setName));
    const createdAt = Date.parse(card.createdAt);
    const updatedAt = Date.parse(card.updatedAt);
    remember(set, createdAt, "added");
    if (updatedAt > createdAt || !Number.isFinite(createdAt)) remember(set, updatedAt, "updated");
  }
  return [...recent.values()]
    .sort((a, b) => b.activityAt - a.activityAt || a.set.name.localeCompare(b.set.name))
    .slice(0, Math.max(0, limit));
}

export function formatSetActivityTime(at: number, now = Date.now()): string {
  const age = Math.max(0, now - at);
  if (age < 60_000) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  if (age < 3_600_000) return formatter.format(-Math.floor(age / 60_000), "minute");
  if (age < 86_400_000) return formatter.format(-Math.floor(age / 3_600_000), "hour");
  return formatter.format(-Math.floor(age / 86_400_000), "day");
}