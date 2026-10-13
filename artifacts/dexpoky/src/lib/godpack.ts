// The Ascended Heroes God Pack pulled on the DexPoky YouTube channel, shown at /godpack.
// Live market prices come from the public catalog (TCGplayer via TCGCSV); the snapshot
// values are PriceCharting figures used when a live price is unavailable and for PSA 10.

export const GODPACK_VIDEO_ID = "Ur2OtmOknv4";
export const GODPACK_REVEAL_SECONDS = 30 * 60 + 12;
export const GODPACK_SNAPSHOT_DATE = "Oct 7, 2026";

export type GodPackCard = {
  catalogId: string;
  name: string;
  number: string;
  rarity: string;
  snapshotRaw: number;
  snapshotPsa10: number;
  watchAtSeconds: number;
};

const UP_CLOSE = 39 * 60 + 38;

// In the order they came out of the pack.
export const GODPACK_CARDS: GodPackCard[] = [
  { catalogId: "tcgcsv_24541_676078", name: "Mega Eelektross ex", number: "266/217", rarity: "Mega Attack Rare", snapshotRaw: 4.49, snapshotPsa10: 49, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676079", name: "Mega Diancie ex", number: "267/217", rarity: "Mega Attack Rare", snapshotRaw: 6.53, snapshotPsa10: 43, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676077", name: "Mega Froslass ex", number: "265/217", rarity: "Mega Attack Rare", snapshotRaw: 7.59, snapshotPsa10: 50, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676085", name: "Mega Emboar ex", number: "273/217", rarity: "Special Illustration Rare", snapshotRaw: 41.22, snapshotPsa10: 114.5, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676091", name: "Iono's Bellibolt ex", number: "279/217", rarity: "Special Illustration Rare", snapshotRaw: 50.85, snapshotPsa10: 95.83, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676087", name: "Mega Froslass ex", number: "275/217", rarity: "Special Illustration Rare", snapshotRaw: 64.99, snapshotPsa10: 134.2, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676084", name: "Mega Meganium ex", number: "272/217", rarity: "Special Illustration Rare", snapshotRaw: 67.48, snapshotPsa10: 137, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676098", name: "N's Zoroark ex", number: "286/217", rarity: "Special Illustration Rare", snapshotRaw: 135.24, snapshotPsa10: 252.79, watchAtSeconds: UP_CLOSE },
  { catalogId: "tcgcsv_24541_676089", name: "Pikachu ex", number: "277/217", rarity: "Special Illustration Rare", snapshotRaw: 297.03, snapshotPsa10: 722.02, watchAtSeconds: 33 * 60 + 23 },
  { catalogId: "tcgcsv_24541_676102", name: "Mega Dragonite ex", number: "290/217", rarity: "Special Illustration Rare", snapshotRaw: 450, snapshotPsa10: 949.62, watchAtSeconds: 32 * 60 + 32 },
];

export function godPackImageUrl(card: GodPackCard): string {
  const productId = card.catalogId.split("_").pop();
  return `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_400w.jpg`;
}

export function godPackWatchUrl(seconds: number): string {
  return `https://www.youtube.com/watch?v=${GODPACK_VIDEO_ID}&t=${seconds}s`;
}

/** The live price when it is a usable number, otherwise the snapshot. */
export function godPackRawValue(card: GodPackCard, livePrice: number | null | undefined): { value: number; live: boolean } {
  return typeof livePrice === "number" && Number.isFinite(livePrice) && livePrice > 0
    ? { value: livePrice, live: true }
    : { value: card.snapshotRaw, live: false };
}

export function godPackTotals(livePrices: (number | null | undefined)[]): { raw: number; psa10: number; allLive: boolean } {
  let raw = 0;
  let allLive = true;
  GODPACK_CARDS.forEach((card, i) => {
    const { value, live } = godPackRawValue(card, livePrices[i]);
    raw += value;
    allLive &&= live;
  });
  const psa10 = GODPACK_CARDS.reduce((sum, card) => sum + card.snapshotPsa10, 0);
  return { raw, psa10, allLive };
}
