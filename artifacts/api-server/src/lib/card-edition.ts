/** Explicit printing attributes; unknown never means Unlimited. */
export const CARD_EDITIONS = ["unknown", "unlimited", "first_edition", "shadowless", "first_edition_shadowless"] as const;
export type CardEdition = typeof CARD_EDITIONS[number];

export function isVintageEditionSet(setName: string | null): boolean {
  return !!setName && /\b(?:base set|jungle|fossil|team rocket|gym|neo)\b/i.test(setName);
}

/** Recognize only explicit seller statements, never a query or catalog name. */
export function sellerEdition(title: string): CardEdition | null {
  // Match the tokenization used by the verifier's remainder allowlist: "non"
  // is valid in Non-Holo, but must never negate a positive edition assertion.
  const tokens = title.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  if (/\b(?:non|not|no|without)\s+(?:(?:first|1st)\s+edition|shadowless|unlimited)\b/.test(tokens)) return null;
  const first = /\b(?:first|1st)[\s-]+edition\b/i.test(title);
  const shadowless = /\bshadowless\b/i.test(title);
  const unlimited = /\bunlimited\b/i.test(title);
  if (unlimited && (first || shadowless)) return null;
  if (first && shadowless) return "first_edition_shadowless";
  if (first) return "first_edition";
  if (shadowless) return "shadowless";
  return unlimited ? "unlimited" : "unknown";
}