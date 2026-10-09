import { createHmac } from "node:crypto";

export type PurchaseSource = "marketplace" | "inbox" | "dex_agent";

/** Only confirmed USD settlements belong here. No user/product free text. */
export function purchaseReceipt(
  kind: "listing" | "trade",
  saleId: number | null,
  amountCents: unknown,
  currency: unknown,
  source: PurchaseSource,
  signingKey: string,
) {
  if (!signingKey) throw new Error("Purchase analytics signing key is not configured");
  if (!Number.isSafeInteger(saleId) || !saleId || saleId < 1 ||
      typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0 ||
      typeof currency !== "string" || currency.toUpperCase() !== "USD") return null;
  return {
    // A sale key, not a Stripe/session/account identifier. Stable across retries.
    transaction_id: `dp_${createHmac("sha256", signingKey).update(`dexpoky-sale:${kind}:${saleId}`).digest("hex")}`,
    value: amountCents / 100,
    currency: "USD" as const,
    source,
    items: [{ item_id: "pokemon_card" as const, item_category: "pokemon_card" as const, price: amountCents / 100, quantity: 1 as const }],
  };
}
