import {
  getTcgcsvCard,
  getTcgcsvPokemonGroupCards,
  getTcgcsvPokemonGroups,
  type TcgcsvPokemonGroup,
} from "./tcgcsv.js";
import {
  mergeTcgcsvSetCards,
  tcgcsvGroupMatchesSet,
  type PokemonSetForMerge,
  type TcgcsvSetCard,
} from "./pokemon-set-catalog.js";
import { pwGetCard } from "./pokewallet.js";
import { rememberMergedSetCount } from "./pokemon-set-count-cache.js";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

export interface CanonicalSetCard {
  id: string;
  localId: string;
  name: string;
  image?: string | null;
}

export interface CanonicalSetDetail {
  id: string;
  name: string;
  cards: CanonicalSetCard[];
}

export interface SetCardSupplement {
  setId: string;
  catalogCardId: string;
  identityKey: string;
  localId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  sourceId: string;
  verifiedAt: Date;
}

export type EnsureSetCardResult = {
  status: "already_present" | "added" | "unmatched";
  setId?: string;
  setName?: string;
  cardId?: string;
  message: string;
};

type ResolvedPrinting = {
  id: string;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  imageUrl: string | null;
  rarity: string | null;
  source: "tcgdex" | "tcgcsv" | "pokewallet";
  tcgcsvGroupId?: number;
};

type SetSummary = { id: string; name: string };
type TcgDexSetResponse = SetSummary & {
  cards?: CanonicalSetCard[];
};

export class CatalogVerificationUnavailable extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedNumber(value: string): string {
  const [numerator, denominator] = value.trim().toLowerCase().split("/");
  const local = (numerator ?? "").replace(/\s+/g, "");
  const normalizedLocal = /^\d+$/.test(local) ? String(Number(local)) : local;
  return denominator ? `${normalizedLocal}/${denominator.trim().replace(/\s+/g, "")}` : normalizedLocal;
}

function sameCollectorNumber(left: string, right: string): boolean {
  const leftParts = normalizedNumber(left).split("/");
  const rightParts = normalizedNumber(right).split("/");
  return leftParts[0] !== "" && leftParts[0] === rightParts[0] &&
    (!leftParts[1] || !rightParts[1] || leftParts[1] === rightParts[1]);
}

function sameCardIdentity(
  left: { name: string; localId: string },
  right: { name: string; localId: string },
): boolean {
  return normalizedText(left.name) !== "" &&
    normalizedText(left.name) === normalizedText(right.name) &&
    sameCollectorNumber(left.localId, right.localId);
}

export function setCardIdentityKey(name: string, localId: string): string {
  return JSON.stringify([normalizedNumber(localId), normalizedText(name)]);
}

function asMergeSet(set: CanonicalSetDetail): PokemonSetForMerge {
  return {
    id: set.id,
    name: set.name,
    cards: set.cards.map((card) => ({
      id: card.id,
      localId: card.localId,
      name: card.name,
      imageUrl: card.image ? `${card.image.replace(/\/+$/, "")}/high.png` : null,
    })),
  };
}

function safeImage(value: unknown, suffix: string): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(`${value.replace(/\/+$/, "")}${suffix}`);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" } });
  } catch {
    throw new CatalogVerificationUnavailable("The provider catalog is temporarily unavailable.");
  }
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new CatalogVerificationUnavailable("The provider catalog is temporarily unavailable.");
  }
  try {
    return await response.json() as unknown;
  } catch {
    throw new CatalogVerificationUnavailable("The provider returned invalid catalog data.");
  }
}

async function tcgdexCard(id: string): Promise<ResolvedPrinting | null> {
  const payload = await fetchJson(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`);
  if (!record(payload) || payload.id !== id || typeof payload.name !== "string" ||
    !record(payload.set) || typeof payload.set.id !== "string" || typeof payload.set.name !== "string" ||
    typeof payload.localId !== "string") return null;
  return {
    id,
    name: payload.name,
    setId: payload.set.id,
    setName: payload.set.name,
    localId: payload.localId,
    imageUrl: safeImage(payload.image, "/high.png"),
    rarity: typeof payload.rarity === "string" ? payload.rarity : null,
    source: "tcgdex",
  };
}

function tcgcsvPrinting(card: Awaited<ReturnType<typeof getTcgcsvCard>>): ResolvedPrinting | null {
  if (!card) return null;
  const match = /^tcgcsv_([1-9]\d*)_[1-9]\d*$/.exec(card.id);
  if (!match || !card.name || !card.setName || !card.cardNumber) return null;
  return {
    id: card.id,
    name: card.name,
    setId: card.setId,
    setName: card.setName,
    localId: card.cardNumber,
    imageUrl: safeImage(card.imageUrl, ""),
    rarity: card.rarity ?? null,
    source: "tcgcsv",
    tcgcsvGroupId: Number(match[1]),
  };
}

async function resolvePrinting(catalogCardId: string): Promise<ResolvedPrinting | null> {
  if (/^tcgcsv_[1-9]\d*_[1-9]\d*$/.test(catalogCardId)) {
    return tcgcsvPrinting(await getTcgcsvCard(catalogCardId));
  }
  const tcgdexId = catalogCardId.startsWith("tcgdex_")
    ? catalogCardId.slice("tcgdex_".length)
    : catalogCardId;
  if (/^[a-z0-9.]+-[a-z0-9]+$/i.test(tcgdexId)) {
    return await tcgdexCard(tcgdexId);
  }

  const result = await pwGetCard(catalogCardId);
  if (!result.ok || result.data.id !== catalogCardId || !record(result.data.card_info)) return null;
  const info = result.data.card_info;
  const name = (info.clean_name ?? info.name)?.trim();
  const setName = info.set_name?.trim();
  const localId = info.card_number?.trim();
  if (!name || !setName || !localId) return null;
  return {
    id: catalogCardId,
    name,
    setName,
    setId: info.set_code?.trim() ?? "",
    localId,
    imageUrl: safeImage(result.data.image_url ?? info.image_url, ""),
    rarity: info.rarity ?? null,
    source: "pokewallet",
  };
}

async function tcgdexSet(id: string): Promise<CanonicalSetDetail | null> {
  const payload = await fetchJson(`${TCGDEX_BASE}/sets/${encodeURIComponent(id)}`);
  if (!record(payload) || payload.id !== id || typeof payload.name !== "string" ||
    !Array.isArray(payload.cards)) return null;
  const cards = payload.cards.filter((card): card is CanonicalSetCard =>
    record(card) && typeof card.id === "string" && typeof card.localId === "string" &&
    typeof card.name === "string",
  );
  if (cards.length !== payload.cards.length) return null;
  return { id, name: payload.name, cards };
}

async function resolveCanonicalSet(
  printing: ResolvedPrinting,
  groups: TcgcsvPokemonGroup[],
): Promise<{ set: CanonicalSetDetail; group: TcgcsvPokemonGroup } | null> {
  const summariesPayload = await fetchJson(`${TCGDEX_BASE}/sets`);
  if (!Array.isArray(summariesPayload)) {
    throw new CatalogVerificationUnavailable("TCGdex returned an invalid set index.");
  }
  const summaries = summariesPayload.filter((item): item is SetSummary =>
    record(item) && typeof item.id === "string" && typeof item.name === "string",
  );
  let summary: SetSummary | undefined;
  if (printing.source === "tcgdex") {
    const candidates = summaries.filter((item) => item.id === printing.setId && item.name === printing.setName);
    if (candidates.length !== 1) return null;
    summary = candidates[0];
  } else if (printing.tcgcsvGroupId !== undefined) {
    const candidates = summaries.filter((item) => {
      const setForMatch: PokemonSetForMerge = { id: item.id, name: item.name, cards: [] };
      const matches = groups.filter((group) => tcgcsvGroupMatchesSet(group, setForMatch));
      return matches.length === 1 && matches[0]!.groupId === printing.tcgcsvGroupId;
    });
    if (candidates.length !== 1) return null;
    summary = candidates[0];
  } else {
    const candidates = summaries.filter((item) => normalizedText(item.name) === normalizedText(printing.setName));
    if (candidates.length !== 1) return null;
    summary = candidates[0];
  }
  if (!summary) return null;

  const set = await tcgdexSet(summary.id);
  if (!set || set.name !== summary.name) return null;
  const setForMatch = asMergeSet(set);
  const matchingGroups = groups.filter((group) => tcgcsvGroupMatchesSet(group, setForMatch));
  if (matchingGroups.length !== 1) return null;
  const group = matchingGroups[0]!;
  if (printing.tcgcsvGroupId !== undefined && group.groupId !== printing.tcgcsvGroupId) return null;
  return { set, group };
}

export function mergeSetCardSupplements(
  cards: Array<{
    id: string;
    localId: string;
    name: string;
    imageUrl?: string | null;
    rarity?: string | null;
    catalogIds?: string[];
  }>,
  supplements: Array<{
    catalogCardId: string;
    localId: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
  }>,
) {
  const merged = cards.map((card) => ({ ...card, catalogIds: [...new Set(card.catalogIds ?? [card.id])] }));
  for (const supplement of supplements) {
    const existing = merged.filter((card) => sameCardIdentity(card, supplement));
    if (existing.length === 1) {
      const canonical = existing[0]!;
      canonical.catalogIds = [...new Set([...canonical.catalogIds, supplement.catalogCardId])].sort();
    } else if (existing.length === 0 && !merged.some((card) => sameCollectorNumber(card.localId, supplement.localId))) {
      merged.push({
        id: supplement.catalogCardId,
        localId: supplement.localId,
        name: supplement.name,
        imageUrl: supplement.imageUrl,
        rarity: supplement.rarity,
        catalogIds: [supplement.catalogCardId],
      });
    }
  }
  return merged;
}

async function loadSupplements(setId: string) {
  const { pool } = await import("@workspace/db");
  const result = await pool.query<{
    catalogCardId: string;
    localId: string;
    name: string;
    imageUrl: string | null;
    rarity: string | null;
  }>(
    `SELECT catalog_card_id AS "catalogCardId", local_id AS "localId", name,
            image_url AS "imageUrl", rarity
       FROM pokemon_set_card_supplements
      WHERE set_id = $1`,
    [setId],
  );
  return result.rows;
}

export async function getSetCardSupplements(setId: string) {
  return await loadSupplements(setId);
}

function result(
  status: EnsureSetCardResult["status"],
  set: CanonicalSetDetail,
  message: string,
  cardId?: string,
): EnsureSetCardResult {
  return { status, setId: set.id, setName: set.name, ...(cardId ? { cardId } : {}), message };
}

function catalogIdentityMatch(
  card: { name: string; localId: string },
  printing: ResolvedPrinting,
): boolean {
  return sameCardIdentity(card, printing);
}

export async function ensureSetCatalogCard(catalogCardId: string): Promise<EnsureSetCardResult> {
  const printing = await resolvePrinting(catalogCardId);
  if (!printing) {
    return {
      status: "unmatched",
      message: "This catalog printing could not be verified from its exact provider ID.",
    };
  }
  const groups = await getTcgcsvPokemonGroups();
  if (!groups) {
    throw new CatalogVerificationUnavailable("The TCGCSV catalog is temporarily unavailable.");
  }
  const canonical = await resolveCanonicalSet(printing, groups);
  if (!canonical) {
    return {
      status: "unmatched",
      message: "This printing could not be mapped uniquely to an English canonical set.",
    };
  }

  // PokeWallet IDs are opaque. They are accepted only when a complete exact
  // name/number crosswalk identifies one official TCGdex checklist entry.
  if (printing.source === "pokewallet") {
    const matches = canonical.set.cards.filter((card) => catalogIdentityMatch(card, printing));
    if (matches.length !== 1) {
      return {
        status: "unmatched",
        message: "The opaque catalog ID has no unique full identity crosswalk to the canonical set.",
      };
    }
    return result("already_present", canonical.set, "This verified card is already in the set checklist.", matches[0]!.id);
  }

  const providerCards = await getTcgcsvPokemonGroupCards(canonical.group.groupId);
  if (!providerCards) {
    throw new CatalogVerificationUnavailable("The matching TCGCSV set cards could not be verified.");
  }
  const mergedCards = mergeTcgcsvSetCards(
    asMergeSet(canonical.set),
    providerCards.map((card): TcgcsvSetCard => ({
      id: card.id,
      name: card.name,
      setName: card.setName,
      setId: card.setId,
      cardNumber: card.cardNumber,
      imageUrl: card.imageUrl,
      rarity: card.rarity,
    })),
  );
  const verifiedCards = mergeSetCardSupplements(mergedCards, await loadSupplements(canonical.set.id));
  rememberMergedSetCount(canonical.set.id, verifiedCards.length);
  const existing = verifiedCards.filter((card) =>
    card.id === printing.id ||
    (card.catalogIds ?? []).includes(printing.id) ||
    catalogIdentityMatch(card, printing),
  );
  if (existing.length > 0) {
    return result("already_present", canonical.set, "This verified card is already in the set checklist.", existing[0]!.id);
  }
  if (verifiedCards.some((card) => sameCollectorNumber(card.localId, printing.localId))) {
    return {
      status: "unmatched",
      message: "This number is already in the expansion checklist, but its exact card identity could not be matched. No duplicate was added.",
    };
  }

  // An opaque provider ID cannot be stored as a new supplement unless it has
  // a full crosswalk; the TCGdex set crosswalk above is intentionally strict.
  const identityKey = setCardIdentityKey(printing.name, printing.localId);
  const values: SetCardSupplement = {
    setId: canonical.set.id,
    catalogCardId: printing.id,
    identityKey,
    localId: printing.localId,
    name: printing.name,
    imageUrl: printing.imageUrl,
    rarity: printing.rarity,
    sourceId: printing.id,
    verifiedAt: new Date(),
  };
  const { pool } = await import("@workspace/db");
  const inserted = await pool.query<{ catalogCardId: string }>(
    `INSERT INTO pokemon_set_card_supplements
       (set_id, catalog_card_id, identity_key, local_id, name, image_url, rarity, source_id, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING catalog_card_id AS "catalogCardId"`,
    [
      values.setId,
      values.catalogCardId,
      values.identityKey,
      values.localId,
      values.name,
      values.imageUrl,
      values.rarity,
      values.sourceId,
      values.verifiedAt,
    ],
  );
  if ((inserted.rowCount ?? 0) > 0) {
    rememberMergedSetCount(canonical.set.id, verifiedCards.length + 1);
    return result("added", canonical.set, "The verified missing card was added to the set checklist.", printing.id);
  }
  const refreshed = await loadSupplements(canonical.set.id);
  const saved = refreshed.find((row) =>
    row.catalogCardId === printing.id ||
    setCardIdentityKey(row.name, row.localId) === identityKey,
  );
  if (saved) {
    rememberMergedSetCount(canonical.set.id, mergeSetCardSupplements(mergedCards, refreshed).length);
    return result(
      "already_present",
      canonical.set,
      "This verified card is already in the set checklist.",
      saved.catalogCardId,
    );
  }
  throw new CatalogVerificationUnavailable("The verified checklist supplement could not be saved.");
}
