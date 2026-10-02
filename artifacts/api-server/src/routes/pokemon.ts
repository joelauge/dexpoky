import { Router } from "express";
import {
  getTcgcsvPokemonGroupCards,
  getTcgcsvPokemonGroups,
  type TcgcsvPokemonGroup,
} from "../lib/tcgcsv.js";
import type { TcgResult } from "./detect-helpers.js";
import { cachedMergedSetCount, rememberMergedSetCount } from "../lib/pokemon-set-count-cache.js";
import {
  mergeTcgcsvSetCards,
  sourceOnlyTcgcsvGroup,
  tcgcsvGroupMatchesSet,
  type PokemonSetForMerge,
  type TcgcsvSetCard,
} from "../lib/pokemon-set-catalog.js";
import {
  getSetCardSupplements,
  mergeSetCardSupplements,
} from "../lib/pokemon-set-card-supplements.js";

const router = Router();
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface TcgDexCardDetail extends CardBrief {
  rarity?: string;
}

interface SetBrief {
  id: string;
  name: string;
}

interface TcgDexSet {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  cardCount?: {
    total?: number;
    official?: number;
  };
  serie?: {
    name?: string;
  };
  cards?: CardBrief[];
}

const cardRarityCache = new Map<string, string | null>();
const ASCENDED_HEROES_MEGA_ATTACK_RARE_NUMBERS = new Set([
  "265",
  "266",
  "267",
  "268",
  "269",
  "270",
  "271",
]);

function officialRarity(setId: string, localId: string, providerRarity: string | null): string | null {
  if (
    setId === "me02.5"
    && ASCENDED_HEROES_MEGA_ATTACK_RARE_NUMBERS.has(localId)
  ) {
    return "Mega Attack Rare";
  }
  return providerRarity;
}

async function loadCardRarities(cards: CardBrief[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uncached = cards.filter((card) => {
    if (!cardRarityCache.has(card.id)) return true;
    result.set(card.id, cardRarityCache.get(card.id) ?? null);
    return false;
  });

  const concurrency = 16;
  for (let index = 0; index < uncached.length; index += concurrency) {
    const batch = uncached.slice(index, index + concurrency);
    await Promise.all(batch.map(async (card) => {
      let rarity: string | null = null;
      try {
        const response = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(card.id)}`);
        if (response.ok) {
          const detail = (await response.json()) as TcgDexCardDetail;
          rarity = detail.rarity ?? null;
        }
      } catch {
        rarity = null;
      }
      cardRarityCache.set(card.id, rarity);
      result.set(card.id, rarity);
    }));
  }

  return result;
}

function assetUrl(value?: string): string | null {
  return value ? `${value}.png` : null;
}

function normalizeSet(set: TcgDexSet) {
  return {
    id: set.id,
    name: set.name,
    logoUrl: assetUrl(set.logo),
    symbolUrl: assetUrl(set.symbol),
    seriesName: set.serie?.name ?? null,
    releaseDate: set.releaseDate ?? null,
    totalCards: set.cardCount?.total ?? set.cardCount?.official ?? set.cards?.length ?? 0,
  };
}

function tcgcsvSetCard(card: TcgResult): TcgcsvSetCard {
  return {
    id: card.id,
    name: card.name,
    setName: card.setName,
    setId: card.setId,
    cardNumber: card.cardNumber,
    imageUrl: card.imageUrl,
    rarity: card.rarity,
  };
}

async function loadGroupsBounded(groups: TcgcsvPokemonGroup[]): Promise<Map<number, TcgcsvSetCard[]> | null> {
  const loaded = new Map<number, TcgcsvSetCard[]>();
  let next = 0;
  let failed = false;
  const workers = Array.from({ length: Math.min(4, groups.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= groups.length) return;
      const group = groups[index]!;
      const cards = await getTcgcsvPokemonGroupCards(group.groupId);
      if (cards === null) {
        failed = true;
        return;
      }
      loaded.set(group.groupId, cards.map(tcgcsvSetCard));
    }
  });
  await Promise.all(workers);
  return failed ? null : loaded;
}

function asMergeSet(set: TcgDexSet): PokemonSetForMerge {
  return {
    id: set.id,
    name: set.name,
    cards: (set.cards ?? []).map((card) => ({
      id: card.id,
      localId: card.localId,
      name: card.name,
      imageUrl: card.image ? `${card.image}/high.png` : null,
    })),
  };
}

function sourceOnlySet(group: TcgcsvPokemonGroup, cards: TcgcsvSetCard[]) {
  const mergedCards = mergeTcgcsvSetCards({ id: `tcgcsv_${group.groupId}`, name: group.name, cards: [] }, cards);
  return {
    id: `tcgcsv_${group.groupId}`,
    name: "Mega Evolution Energies",
    logoUrl: null,
    symbolUrl: null,
    seriesName: null,
    releaseDate: null,
    totalCards: mergedCards.length,
    catalogSetIds: [`tcgcsv_${group.groupId}`],
    cards: mergedCards.map((card) => ({
      id: card.id,
      localId: card.localId,
      name: card.name,
      imageUrl: card.imageUrl ?? null,
      rarity: card.rarity ?? null,
      catalogIds: card.catalogIds ?? [card.id],
    })),
  };
}

async function tcgDexSetDetail(
  set: TcgDexSet,
  groups: TcgcsvPokemonGroup[] | null,
  forcedGroup?: TcgcsvPokemonGroup,
) {
  const cards = set.cards ?? [];
  let mergedCards = mergeTcgcsvSetCards(asMergeSet(set), []);
  let catalogSetIds = [set.id];
  let catalogWarning: string | undefined;
  let catalogVerified = false;
  if (!groups) {
    catalogWarning = "TCGCSV catalog is temporarily unavailable; showing TCGdex cards only.";
  } else {
    const candidates = forcedGroup
      ? [forcedGroup]
      : groups.filter((group) => tcgcsvGroupMatchesSet(group, asMergeSet(set)));
    if (candidates.length === 1) {
      const group = candidates[0]!;
      catalogSetIds = [set.id, `tcgcsv_${group.groupId}`];
      const tcgcsvCards = await getTcgcsvPokemonGroupCards(group.groupId);
      if (tcgcsvCards === null) {
        catalogWarning = "TCGCSV set cards could not be verified; showing TCGdex cards only.";
      } else {
        mergedCards = mergeTcgcsvSetCards(asMergeSet(set), tcgcsvCards.map(tcgcsvSetCard));
        catalogVerified = true;
      }
    } else if (candidates.length === 0) {
      catalogVerified = true;
    }
  }
  let supplementalWarning: string | undefined;
  try {
    const supplements = await getSetCardSupplements(set.id);
    mergedCards = mergeSetCardSupplements(mergedCards, supplements);
  } catch {
    supplementalWarning = "Supplemental checklist entries are temporarily unavailable.";
  }
  if (catalogVerified) rememberMergedSetCount(set.id, mergedCards.length);

  const rarities = await loadCardRarities(cards);
  const dexCards = mergedCards.filter((card) => !card.id.startsWith("tcgcsv_"));
  const providerCards = mergedCards.filter((card) => card.id.startsWith("tcgcsv_"));
  return {
    ...normalizeSet(set),
    totalCards: mergedCards.length,
    catalogSetIds,
    ...(catalogWarning || supplementalWarning
      ? { catalogWarning: [catalogWarning, supplementalWarning].filter(Boolean).join(" ") }
      : {}),
    cards: [
      ...dexCards.map((card) => ({
        id: card.id,
        localId: card.localId,
        name: card.name,
        imageUrl: card.imageUrl ?? null,
        rarity: officialRarity(set.id, card.localId, rarities.get(card.id) ?? null),
        catalogIds: card.catalogIds ?? [card.id],
      })),
      ...providerCards.map((card) => ({
        id: card.id,
        localId: card.localId,
        name: card.name,
        imageUrl: card.imageUrl ?? null,
        rarity: card.rarity ?? null,
        catalogIds: card.catalogIds ?? [card.id],
      })),
    ],
  };
}

router.get("/pokemon/search", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  try {
    const searchRes = await fetch(
      `${TCGDEX_BASE}/cards?name=*${encodeURIComponent(query)}*`,
    );
    if (!searchRes.ok) {
      res.json([]);
      return;
    }

    const cards = (await searchRes.json()) as CardBrief[];
    if (!Array.isArray(cards) || cards.length === 0) {
      res.json([]);
      return;
    }

    const limited = cards.slice(0, 12);

    const setIds = [
      ...new Set(limited.map((c) => c.id.split("-")[0]).filter(Boolean)),
    ] as string[];

    const setMap: Record<string, string> = {};
    await Promise.all(
      setIds.map(async (setId) => {
        try {
          const setRes = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
          if (setRes.ok) {
            const setData = (await setRes.json()) as SetBrief;
            setMap[setId] = setData.name ?? setId;
          } else {
            setMap[setId] = setId;
          }
        } catch {
          setMap[setId] = setId;
        }
      }),
    );

    const results = limited.map((card) => {
      const setId = card.id.split("-")[0] ?? "";
      const cardNumber = card.localId ?? card.id.split("-")[1] ?? "";
      const imageUrl = card.image ? `${card.image}/high.png` : "";

      return {
        id: card.id,
        name: card.name,
        imageUrl,
        setName: setMap[setId] ?? setId,
        setId,
        cardNumber,
        rarity: null,
      };
    });

    res.json(results);
  } catch (err) {
    req.log?.error({ err }, "TCGdex search failed");
    res.status(502).json({ error: "Failed to search cards" });
  }
});

router.get("/pokemon/sets", async (req, res) => {
  try {
    const setsRes = await fetch(`${TCGDEX_BASE}/sets`);
    if (!setsRes.ok) {
      res.status(502).json({ error: "Failed to load sets" });
      return;
    }

    const sets = (await setsRes.json()) as TcgDexSet[];
    if (!Array.isArray(sets)) {
      res.status(502).json({ error: "TCGdex returned an invalid set catalog" });
      return;
    }

    const groups = await getTcgcsvPokemonGroups();
    if (!groups) {
      res.status(502).json({ error: "Failed to verify the TCGCSV Pokemon catalog" });
      return;
    }

    const candidatesBySet = new Map(
      sets.map((set) => [
        set.id,
        groups.filter((group) => tcgcsvGroupMatchesSet(group, asMergeSet(set))),
      ]),
    );
    const candidateUseCount = new Map<number, number>();
    for (const candidates of candidatesBySet.values()) {
      if (candidates.length === 1) {
        const groupId = candidates[0]!.groupId;
        candidateUseCount.set(groupId, (candidateUseCount.get(groupId) ?? 0) + 1);
      }
    }
    const mergeGroups = new Map<string, TcgcsvPokemonGroup>();
    for (const [setId, candidates] of candidatesBySet) {
      if (candidates.length === 1 && candidateUseCount.get(candidates[0]!.groupId) === 1) {
        mergeGroups.set(setId, candidates[0]!);
      }
    }
    const mergedGroupIds = new Set([...mergeGroups.values()].map((group) => group.groupId));
    const sourceOnlyGroups = groups.filter(
      (group) => sourceOnlyTcgcsvGroup(group) && !mergedGroupIds.has(group.groupId),
    );
    const indexedGroups = new Map<string, TcgcsvPokemonGroup>();
    for (const [setId, group] of mergeGroups) {
      if (sourceOnlyTcgcsvGroup(group) && cachedMergedSetCount(setId) === null) {
        indexedGroups.set(`${setId}:${group.groupId}`, group);
      }
    }
    for (const group of sourceOnlyGroups) {
      if (cachedMergedSetCount(`tcgcsv_${group.groupId}`) === null) {
        indexedGroups.set(`tcgcsv_${group.groupId}:${group.groupId}`, group);
      }
    }
    const selectedGroups = [...new Map(
      [...indexedGroups.values()].map((group) => [group.groupId, group]),
    ).values()];
    const catalogs = await loadGroupsBounded(selectedGroups);
    if (!catalogs) {
      res.status(502).json({ error: "Failed to verify matching TCGCSV Pokemon cards" });
      return;
    }

    const listedSets = sets.map((set) => {
      const base = normalizeSet(set);
      const group = mergeGroups.get(set.id);
      if (!group) return { ...base, catalogSetIds: [set.id] };
      let totalCards = cachedMergedSetCount(set.id) ?? base.totalCards;
      const cards = catalogs?.get(group.groupId);
      if (sourceOnlyTcgcsvGroup(group) && cards?.length) {
        const providerCardCount = mergeTcgcsvSetCards(
          { id: `tcgcsv_${group.groupId}`, name: group.name, cards: [] },
          cards,
        ).length;
        if (!set.cards?.length) totalCards = Math.max(base.totalCards, providerCardCount);
        else totalCards = mergeTcgcsvSetCards(asMergeSet(set), cards).length;
        rememberMergedSetCount(set.id, totalCards);
      } else if (set.cards?.length && cards) {
        totalCards = mergeTcgcsvSetCards(asMergeSet(set), cards).length;
      }
      return {
        ...base,
        totalCards,
        catalogSetIds: [set.id, `tcgcsv_${group.groupId}`],
      };
    });
    for (const group of sourceOnlyGroups) {
      const cards = catalogs.get(group.groupId) ?? [];
      const catalogSetId = `tcgcsv_${group.groupId}`;
      const totalCards = cachedMergedSetCount(catalogSetId) ??
        (cards.length
          ? sourceOnlySet(group, cards).cards.length
          : 0);
      if (totalCards > 0) listedSets.push({
        id: `tcgcsv_${group.groupId}`,
        name: "Mega Evolution Energies",
        logoUrl: null,
        symbolUrl: null,
        seriesName: null,
        releaseDate: null,
        totalCards,
        catalogSetIds: [`tcgcsv_${group.groupId}`],
      });
    }
    res.json(listedSets);
  } catch (err) {
    req.log?.error({ err }, "TCGdex sets request failed");
    res.status(502).json({ error: "Failed to load sets" });
  }
});

router.get("/pokemon/sets/:id", async (req, res) => {
  const sourceOnlyId = /^tcgcsv_([1-9]\d*)$/.exec(req.params.id);
  try {
    if (sourceOnlyId) {
      const groups = await getTcgcsvPokemonGroups();
      if (!groups) {
        res.status(502).json({ error: "Failed to verify the TCGCSV Pokemon catalog" });
        return;
      }
      const group = groups.find((candidate) => candidate.groupId === Number(sourceOnlyId[1]));
      if (!group) {
        res.status(404).json({ error: "Set not found" });
        return;
      }

      const setsRes = await fetch(`${TCGDEX_BASE}/sets`);
      if (!setsRes.ok) {
        res.status(502).json({ error: "Failed to verify the native Pokemon set catalog" });
        return;
      }
      const summaries = (await setsRes.json()) as TcgDexSet[];
      if (!Array.isArray(summaries)) {
        res.status(502).json({ error: "TCGdex returned an invalid set catalog" });
        return;
      }
      const nativeCandidates = summaries.filter((set) => tcgcsvGroupMatchesSet(group, asMergeSet(set)));
      if (nativeCandidates.length === 1) {
        const nativeSet = nativeCandidates[0]!;
        const matchingGroups = groups.filter((candidate) =>
          tcgcsvGroupMatchesSet(candidate, asMergeSet(nativeSet)),
        );
        if (matchingGroups.length === 1 && matchingGroups[0]!.groupId === group.groupId) {
          const setRes = await fetch(
            `${TCGDEX_BASE}/sets/${encodeURIComponent(nativeSet.id)}`,
          );
          if (!setRes.ok) {
            res.status(setRes.status === 404 ? 404 : 502).json({ error: "Failed to load set" });
            return;
          }
          const set = (await setRes.json()) as TcgDexSet;
          res.json(await tcgDexSetDetail(set, groups, group));
          return;
        }
      }

      if (sourceOnlyTcgcsvGroup(group)) {
        const cards = await getTcgcsvPokemonGroupCards(group.groupId);
        if (cards === null) {
          res.status(502).json({ error: "Failed to verify TCGCSV set cards" });
          return;
        }
        const verifiedCards = cards.map(tcgcsvSetCard);
        if (verifiedCards.length === 0) {
          res.status(404).json({ error: "Set not found" });
          return;
        }
        const detail = sourceOnlySet(group, verifiedCards);
        rememberMergedSetCount(`tcgcsv_${group.groupId}`, detail.totalCards);
        res.json(detail);
        return;
      }

      res.status(404).json({ error: "Set not found" });
      return;
    }

    const setRes = await fetch(
      `${TCGDEX_BASE}/sets/${encodeURIComponent(req.params.id)}`,
    );
    if (setRes.status === 404) {
      res.status(404).json({ error: "Set not found" });
      return;
    }
    if (!setRes.ok) {
      res.status(502).json({ error: "Failed to load set" });
      return;
    }

    const set = (await setRes.json()) as TcgDexSet;
    const groups = await getTcgcsvPokemonGroups();
    res.json(await tcgDexSetDetail(set, groups));
  } catch (err) {
    req.log?.error({ err }, "TCGdex set detail request failed");
    res.status(502).json({ error: "Failed to load set" });
  }
});

export default router;
