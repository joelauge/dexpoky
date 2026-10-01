export interface SetCardLike {
  id: string;
  localId: string;
  name: string;
  catalogIds?: string[];
}

export interface PokemonSetLike {
  id: string;
  name: string;
  totalCards: number;
  catalogSetIds?: string[];
  cards?: SetCardLike[];
}

export interface OwnedCardLike {
  id: number;
  catalogCardId?: string | null;
  setId?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
}

export interface SetCompletion {
  ownedCardKeys: Set<string>;
  firstOwnedCardIdMap: Map<string, number>;
  ownedCardIdsMap: Map<string, number[]>;
  ownedCount: number;
  missingCount: number;
  totalCount: number;
  completionPercent: number;
  totalPhysicalCount: number;
}

export const normalizeSetCardValue = (value?: string | null) =>
  (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const normalizeSetCardNumber = (value?: string | null) =>
  normalizeSetCardValue(value?.split("/")[0]).replace(/^([a-z]*)0+(\d)/, "$1$2");

export function getCardIdentity(card: OwnedCardLike): string {
  if (card.setId && card.cardNumber) {
    return `${normalizeSetCardValue(card.setId)}-${normalizeSetCardValue(card.cardNumber)}`;
  }
  if (card.setName && card.cardNumber) {
    return `${normalizeSetCardValue(card.setName)}-${normalizeSetCardValue(card.cardNumber)}`;
  }
  if (card.catalogCardId) {
    return card.catalogCardId;
  }
  return `unique-${card.id}`;
}

export function getSetCompletion(
  set: PokemonSetLike,
  ownedCards: OwnedCardLike[],
): SetCompletion {
  const normalizedSetName = normalizeSetCardValue(set.name);
  const setCardsById = new Map(
    set.cards?.flatMap((card) =>
      [card.id, ...(card.catalogIds ?? [])].map((id) => [id, card] as const),
    ) ?? [],
  );
  const setCardsByLocalId = new Map(
    set.cards?.map((card) => [normalizeSetCardNumber(card.localId), card]) ?? [],
  );
  const setIds = new Set([set.id, ...(set.catalogSetIds ?? [])]);
  const ownedCardKeys = new Set<string>();
  const firstOwnedCardIdMap = new Map<string, number>();
  const ownedCardIdsMap = new Map<string, number[]>();
  let totalPhysicalCount = 0;

  for (const card of ownedCards) {
    let matchedKey: string | undefined;

    const catalogMatch = card.catalogCardId
      ? setCardsById.get(card.catalogCardId)
      : undefined;
    const matchedSetId = [...setIds].find((id) =>
      card.catalogCardId?.startsWith(`${id}${id.startsWith("tcgcsv_") ? "_" : "-"}`),
    );
    const hasExplicitCatalogId = !!card.catalogCardId &&
      (/^tcgcsv_/.test(card.catalogCardId) || /^[a-z][a-z0-9.]*-[a-z0-9]+$/i.test(card.catalogCardId));

    if (catalogMatch) {
      matchedKey = catalogMatch.id;
    } else if (!set.cards && matchedSetId) {
      matchedKey = normalizeSetCardNumber(card.cardNumber) ||
        normalizeSetCardNumber(card.catalogCardId?.slice(matchedSetId.length + 1));
    } else if (!hasExplicitCatalogId && (
      (card.setId && setIds.has(card.setId)) ||
      normalizeSetCardValue(card.setName) === normalizedSetName
    )) {
      const normalizedCardNumber = normalizeSetCardNumber(card.cardNumber);
      if (set.cards) {
        matchedKey = setCardsByLocalId.get(normalizedCardNumber)?.id;
      } else {
        matchedKey = normalizedCardNumber || undefined;
      }
    }

    if (matchedKey) {
      ownedCardKeys.add(matchedKey);
      if (!firstOwnedCardIdMap.has(matchedKey)) {
        firstOwnedCardIdMap.set(matchedKey, card.id);
      }
      if (!ownedCardIdsMap.has(matchedKey)) {
        ownedCardIdsMap.set(matchedKey, []);
      }
      ownedCardIdsMap.get(matchedKey)!.push(card.id);
      totalPhysicalCount++;
    }
  }

  const totalCount = set.cards?.length ?? set.totalCards;
  const ownedCount = Math.min(ownedCardKeys.size, totalCount);
  const missingCount = Math.max(0, totalCount - ownedCount);
  const completionPercent =
    totalCount > 0 ? Math.round((ownedCount / totalCount) * 100) : 0;

  return {
    ownedCardKeys,
    firstOwnedCardIdMap,
    ownedCardIdsMap,
    ownedCount,
    missingCount,
    totalCount,
    completionPercent,
    totalPhysicalCount,
  };
}