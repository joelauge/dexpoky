const eventNames = ["sign_up", "login", "card_scan", "listing_created", "trade_offer_sent", "add_to_collection"] as const;
const methods = ["password", "email_code", "email_link", "google", "github", "apple", "twitter", "x", "passkey", "other"] as const;
const sources = ["single_scan", "bulk_scan", "collection_form", "card_lookup", "set_checklist", "marketplace", "inbox", "binder"] as const;

export type AnalyticsEventName = typeof eventNames[number];

// Deliberately exclude free text, account IDs, card names, and contact details.
export type AnalyticsEventParams = {
  method?: typeof methods[number];
  source?: typeof sources[number];
  quantity?: number;
};

declare global {
  interface Window {
    gtag?: (command: "event", name: AnalyticsEventName, params: AnalyticsEventParams) => void;
  }
}

export function trackEvent(name: AnalyticsEventName, params: AnalyticsEventParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    if (!eventNames.includes(name)) return;
    // Only forward explicitly supported metadata, even if a caller passes extras.
    const safe: AnalyticsEventParams = {};
    if (params.method && methods.includes(params.method)) safe.method = params.method;
    if (params.source && sources.includes(params.source)) safe.source = params.source;
    if (typeof params.quantity === "number" && Number.isFinite(params.quantity)) safe.quantity = params.quantity;
    window.gtag("event", name, safe);
  } catch {
    // Analytics must never interrupt an otherwise successful user action.
  }
}
