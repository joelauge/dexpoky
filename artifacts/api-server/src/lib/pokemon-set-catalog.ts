import type { TcgcsvPokemonGroup } from "./tcgcsv.js";

export interface PokemonSetCardForMerge {
  id: string;
  localId: string;
  name: string;
  imageUrl?: string | null;
  rarity?: string | null;
  catalogIds?: string[];
}

export interface PokemonSetForMerge {
  id: string;
  name: string;
  cards: PokemonSetCardForMerge[];
}

export interface TcgcsvSetCard {
  id: string;
  name: string;
  setName: string;
  setId: string;
  cardNumber: string;
  imageUrl: string;
  rarity: string | null;
}

function normalizedText(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedCode(value: string): string {
  const compact = value.toLowerCase().replace(/\s+(?:en|jp|fr|de|es|it|pt)$/i, "").replace(/[^a-z0-9]/g, "");
  return compact.replace(/^([a-z]+)0+(\d+)$/, "$1$2");
}

function groupNameWithoutPrintedCode(name: string): string {
  return name.replace(/^\s*[a-z0-9]{2,8}\s*(?::|[-–—|])\s*/i, "");
}

function printedGroupCodes(group: TcgcsvPokemonGroup): string[] {
  const prefix = /^\s*([a-z0-9]{2,8})\s*(?::|[-–—|])/i.exec(group.name)?.[1];
  return [...new Set([normalizedCode(group.abbreviation), normalizedCode(prefix ?? "")].filter(Boolean))];
}

function isJapaneseOnlyGroup(group: TcgcsvPokemonGroup): boolean {
  return /(?:japanese|japan\s+exclusive|\bjp\b|\(jp\b)/i.test(group.name);
}

/** Exact full-name or exact printed-code matching only. */
export function tcgcsvGroupMatchesSet(group: TcgcsvPokemonGroup, set: PokemonSetForMerge): boolean {
  if (isJapaneseOnlyGroup(group)) return false;
  const nameMatch = normalizedText(groupNameWithoutPrintedCode(group.name)) === normalizedText(set.name);
  const groupCodes = printedGroupCodes(group);
  const idMatch = groupCodes.includes(normalizedCode(set.id));
  const nameCode = /^\s*([a-z0-9]{2,8})\s*(?::|[-–—|])/i.exec(set.name)?.[1];
  const printedCodeMatch = !!nameCode && groupCodes.includes(normalizedCode(nameCode));
  return nameMatch || idMatch || printedCodeMatch;
}

function normalizedCollectorNumber(value: string): string {
  const trimmed = value.trim().toLowerCase().split("/")[0]!.replace(/\s+/g, "");
  if (/^\d+$/.test(trimmed)) return String(Number(trimmed));
  return trimmed;
}

function productIdentityName(name: string, number: string): string {
  const rawNumber = number.trim();
  const finishQualifier = "(?:normal|non[- ]?holo|holo(?:foil)?|reverse[- ]holo(?:foil)?|cosmos[- ]holo(?:foil)?|cracked[- ]ice[- ]holo(?:foil)?|stamped?|team rocket|pok[eé] ball|master ball|pok[eé]mon center)";
  const suffixNumber = /^\d+$/.test(rawNumber)
    ? `0*${String(Number(rawNumber))}`
    : rawNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Metadata after the exact printed number is a product qualifier; meaningful
  // parentheses within the card name remain intact.
  const suffix = new RegExp(`\\s*[-–—]\\s*${suffixNumber}(?:\\s*\\([^)]*\\))*\\s*$`, "i");
  const withoutProductSuffix = name.replace(suffix, "").replace(new RegExp(`\\s*\\(${finishQualifier}\\)\\s*$`, "i"), "");
  const normalized = normalizedText(withoutProductSuffix);
  return normalized.replace(/^basic (?=(?:grass|fire|water|lightning|psychic|fighting|darkness|metal|colorless|dragon) energy$)/, "");
}

function identityKey(name: string, number: string): string {
  return `${normalizedCollectorNumber(number)}\u0000${productIdentityName(name, number)}`;
}

function uniqueAliases(ids: string[]): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/**
 * Preserve TCGdex card identity and metadata, attaching exact TCGCSV aliases.
 * Unmatched catalog printings use their provider identity and native metadata.
 */
export function mergeTcgcsvSetCards(
  set: PokemonSetForMerge,
  tcgcsvCards: TcgcsvSetCard[],
): PokemonSetCardForMerge[] {
  const cards = set.cards.map((card) => ({
    ...card,
    catalogIds: uniqueAliases([card.id, ...(card.catalogIds ?? [])]),
  }));
  const dexByIdentity = new Map<string, number[]>();
  const nativeNumbers = new Set(set.cards.map((card) => normalizedCollectorNumber(card.localId)));
  cards.forEach((card, index) => {
    const key = identityKey(card.name, card.localId);
    const matched = dexByIdentity.get(key) ?? [];
    matched.push(index);
    dexByIdentity.set(key, matched);
  });

  const providerByIdentity = new Map<string, TcgcsvSetCard[]>();
  for (const providerCard of tcgcsvCards) {
    const key = identityKey(providerCard.name, providerCard.cardNumber);
    const matches = providerByIdentity.get(key) ?? [];
    matches.push(providerCard);
    providerByIdentity.set(key, matches);
  }

  for (const [key, providerCards] of providerByIdentity) {
    const dexMatches = dexByIdentity.get(key) ?? [];
    if (dexMatches.length === 1) {
      const canonical = cards[dexMatches[0]!]!;
      canonical.catalogIds = uniqueAliases([
        ...(canonical.catalogIds ?? [canonical.id]),
        ...providerCards.map((card) => card.id),
      ]);
      continue;
    }

    const first = providerCards[0]!;
    // A core checklist has one identity per number. Conflicting names must not
    // create a second entry or gain an unverified alias.
    if (nativeNumbers.has(normalizedCollectorNumber(first.cardNumber))) continue;
    cards.push({
      id: first.id,
      localId: first.cardNumber,
      name: first.name,
      imageUrl: first.imageUrl || null,
      rarity: first.rarity,
      catalogIds: uniqueAliases(providerCards.map((card) => card.id)),
    });
  }

  return cards;
}

export function sourceOnlyTcgcsvGroup(group: TcgcsvPokemonGroup): boolean {
  return group.groupId === 24461 &&
    group.categoryId === 3 &&
    group.name === "MEE: Mega Evolution Energies" &&
    group.abbreviation === "MEE";
}