import type { CatalogCard, CreateCardBody, CreateCardBodyRarity, PriceLookup } from "@workspace/api-client-react";

export function lookupRarity(raw?: string | null): CreateCardBodyRarity | null {
  if (!raw?.trim()) return null;
  const r = raw.toLowerCase();
  if (/secret|rainbow|hyper|special illustration/.test(r)) return "secret_rare";
  if (/ultra|vmax|vstar|illustration|(^| )ex$|(^| )gx$/.test(r)) return "ultra_rare";
  if (r.includes("promo")) return "promo";
  if (r.includes("holo")) return "holo_rare";
  if (r.includes("uncommon")) return "uncommon";
  if (r.includes("rare")) return "rare";
  if (r.includes("common")) return "common";
  return null;
}

export function lookupCardInput({ lookup, catalog, set, imageUrl, rarity, condition, collectionId }: {
  lookup: PriceLookup;
  catalog?: CatalogCard;
  set?: { id: string; name: string };
  imageUrl: string | null;
  rarity: CreateCardBody["rarity"];
  condition: CreateCardBody["condition"];
  collectionId: number | null;
}): CreateCardBody {
  const exact = catalog?.id === lookup.card.id ? catalog : undefined;
  return {
    name: lookup.card.name,
    pokemonName: exact?.pokemonName || lookup.card.name,
    catalogCardId: lookup.card.id,
    setId: set?.id ?? null,
    setName: set?.name ?? lookup.card.setName ?? exact?.setName ?? undefined,
    cardNumber: lookup.card.cardNumber ?? exact?.cardNumber ?? undefined,
    imageUrl,
    rarity, condition, collectionId,
    forSale: false,
  };
}
