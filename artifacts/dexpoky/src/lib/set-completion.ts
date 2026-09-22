export interface SetCardLike {
  id: string;
  localId: string;
  name: string;
}

export interface PokemonSetLike {
  id: string;
  name: string;
  totalCards: number;
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
  const setCardsById = new Map(set.cards?.map((card) => [card.id, card]) ?? []);
  const setCardsByLocalId = new Map(
    set.cards?.map((card) => [normalizeSetCardValue(card.localId), card]) ?? [],
  );
  const ownedCardKeys = new Set<string>();
  const firstOwnedCardIdMap = new Map<string, number>();
  const ownedCardIdsMap = new Map<string, number[]>();
  let totalPhysicalCount = 0;

  for (const card of ownedCards) {
    let matchedKey: string | undefined;

    if (card.catalogCardId?.startsWith(`${set.id}-`)) {
      if (set.cards) {
        matchedKey = setCardsById.get(card.catalogCardId)?.id;
      } else {
        matchedKey = normalizeSetCardValue(
          card.catalogCardId.slice(set.id.length + 1),
        );
      }
    } else if (normalizeSetCardValue(card.setName) === normalizedSetName) {
      const normalizedCardNumber = normalizeSetCardValue(card.cardNumber);
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