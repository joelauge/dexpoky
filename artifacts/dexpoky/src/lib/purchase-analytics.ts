export type ConfirmedPurchase = {
  transaction_id: string;
  value: number;
  currency: "USD";
  source: "marketplace" | "inbox" | "dex_agent";
  items: { item_id: "pokemon_card"; item_category: "pokemon_card"; price: number; quantity: 1 }[];
};

const sent = new Set<string>();

export function purchasesChanged(): void {
  window.dispatchEvent(new Event("purchases:refresh"));
}

/** Runtime allowlist: even unexpected API fields never reach Google. */
export function safePurchase(input: unknown): ConfirmedPurchase | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<ConfirmedPurchase>;
  if (typeof r.transaction_id !== "string" || !/^dp_[a-f0-9]{64}$/.test(r.transaction_id) ||
      typeof r.value !== "number" || !Number.isFinite(r.value) || r.value <= 0 ||
      !Number.isSafeInteger(Math.round(r.value * 100)) || r.currency !== "USD" ||
      !["marketplace", "inbox", "dex_agent"].includes(r.source ?? "")) return null;
  return {
    transaction_id: r.transaction_id,
    value: r.value,
    currency: "USD",
    source: r.source!,
    items: [{ item_id: "pokemon_card", item_category: "pokemon_card", price: r.value, quantity: 1 }],
  };
}

export function trackPurchase(input: unknown): void {
  if (typeof window === "undefined" ||
      !["dexpoky.com", "www.dexpoky.com"].includes(window.location.hostname) ||
      typeof window.gtag !== "function") return;
  const receipt = safePurchase(input);
  if (!receipt || sent.has(receipt.transaction_id)) return;
  const key = `dexpoky:ga4:purchase:${receipt.transaction_id}`;
  try {
    if (window.localStorage.getItem(key)) {
      sent.add(receipt.transaction_id);
      return;
    }
  } catch { /* Memory and GA4 transaction_id still deduplicate without storage. */ }
  try {
    window.gtag("event", "purchase", {
      ...receipt,
      // Do not inherit checkout query tokens or personal profile URL/title.
      page_location: `${window.location.origin}/`,
      page_title: "DexPoky marketplace purchase",
      page_referrer: "",
    });
    sent.add(receipt.transaction_id);
    try { window.localStorage.setItem(key, "1"); } catch { /* Best effort. */ }
  } catch { /* Analytics must not affect the purchase. Retry on next refresh. */ }
}
