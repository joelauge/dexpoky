export const visibleActivityTypes = [
  "card_added",
  "card_updated",
  "card_scanned",
  "listing_created",
  "listing_sold",
  "listing_cancelled",
  "bid_placed",
  "wanted_listing_match",
] as const;

export type VisibleActivityType = (typeof visibleActivityTypes)[number];

export function isVisibleActivityType(type: string): type is VisibleActivityType {
  return visibleActivityTypes.includes(type as VisibleActivityType);
}