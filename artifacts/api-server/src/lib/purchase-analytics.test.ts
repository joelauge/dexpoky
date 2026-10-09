import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { purchaseReceipt as signedReceipt, type PurchaseSource } from "./purchase-analytics.js";

const testKey = "test-only-purchase-key-not-a-real-secret";
const purchaseReceipt = (
  kind: "listing" | "trade", id: number | null, cents: unknown, currency: unknown, source: PurchaseSource,
) => signedReceipt(kind, id, cents, currency, source, testKey);

describe("confirmed purchase receipts", () => {
  it("uses actual numeric USD totals and stable sale keys across retry/source", () => {
    const first = purchaseReceipt("listing", 42, 2599, "usd", "marketplace")!;
    expect(first).toMatchObject({ currency: "USD", value: 25.99 });
    expect(first.items).toEqual([{ item_id: "pokemon_card", item_category: "pokemon_card", price: 25.99, quantity: 1 }]);
    expect(purchaseReceipt("listing", 42, 2599, "USD", "dex_agent")!.transaction_id).toBe(first.transaction_id);
    expect(purchaseReceipt("trade", 42, 2599, "USD", "inbox")!.transaction_id).not.toBe(first.transaction_id);
    expect(first.transaction_id).toMatch(/^dp_[a-f0-9]{64}$/);
  });

  it.each([null, "2599", NaN, Infinity, -1, 0, 2.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-safe paid cents %s", amount => {
      expect(purchaseReceipt("listing", 42, amount, "USD", "marketplace")).toBeNull();
    },
  );

  it("rejects unsupported currencies and missing sale IDs rather than guessing", () => {
    expect(purchaseReceipt("listing", null, 100, "USD", "marketplace")).toBeNull();
    expect(purchaseReceipt("listing", 1, 100, "pathUSD", "marketplace")).toBeNull();
    expect(purchaseReceipt("listing", 1, 100, null, "marketplace")).toBeNull();
  });

  it("cannot be enumerated with an unkeyed sale-ID hash and requires the server key", () => {
    const r = purchaseReceipt("listing", 42, 100, "USD", "marketplace")!;
    const publicHash = `dp_${createHash("sha256").update("dexpoky-sale:listing:42").digest("hex")}`;
    expect(r.transaction_id).not.toBe(publicHash);
    expect(signedReceipt("listing", 42, 100, "USD", "marketplace", "different-test-only-key")!.transaction_id)
      .not.toBe(r.transaction_id);
    expect(() => signedReceipt("listing", 42, 100, "USD", "marketplace", "")).toThrow("not configured");
  });
});
