import assert from "node:assert/strict";
import { test } from "node:test";
import { safePurchase, trackPurchase, type ConfirmedPurchase } from "./purchase-analytics";

const receipt = (id: string): ConfirmedPurchase => ({
  transaction_id: `dp_${id.repeat(64)}`,
  value: 19.99,
  currency: "USD",
  source: "inbox",
  items: [{ item_id: "pokemon_card", item_category: "pokemon_card", price: 19.99, quantity: 1 }],
});

test("runtime allowlist strips all unexpected metadata and personal item fields", () => {
  const r = receipt("a");
  assert.deepEqual(safePurchase({ ...r, email: "private", notes: "private", accountId: "private",
    items: [{ item_name: "private", item_category: "private" }] }), r);
  for (const invalid of [
    { ...r, transaction_id: "user_private" }, { ...r, source: "private" },
    { ...r, value: Infinity }, { ...r, value: "19.99" }, { ...r, value: -1 },
    { ...r, currency: "pathUSD" }, null,
  ]) assert.equal(safePurchase(invalid), null);
});

test("production-only purchase delivery deduplicates reloads/repeats and fails safely", () => {
  const calls: unknown[] = [];
  const storage = new Map<string, string>();
  const location = { hostname: "preview.replit.dev", origin: "https://dexpoky.com" };
  let throwingTag = false;
  let throwingStorage = false;
  const win = {
    location,
    gtag: (...args: unknown[]) => {
      if (throwingTag) throw new Error("tag unavailable");
      calls.push(args);
    },
    localStorage: {
      getItem: (key: string) => {
        if (throwingStorage) throw new Error("storage unavailable");
        return storage.get(key) ?? null;
      },
      setItem: (key: string, value: string) => {
        if (throwingStorage) throw new Error("storage unavailable");
        storage.set(key, value);
      },
    },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: win });
  try {
    const r = receipt("b");
    trackPurchase(r);
    assert.equal(calls.length, 0);
    location.hostname = "dexpoky.com";
    trackPurchase(r);
    trackPurchase(r);
    assert.deepEqual(calls, [["event", "purchase", {
      ...r, page_location: "https://dexpoky.com/", page_title: "DexPoky marketplace purchase", page_referrer: "",
    }]]);
    const reloaded = receipt("c");
    storage.set(`dexpoky:ga4:purchase:${reloaded.transaction_id}`, "1");
    trackPurchase(reloaded);
    assert.equal(calls.length, 1);
    throwingStorage = true;
    trackPurchase(receipt("d"));
    trackPurchase(receipt("d"));
    assert.equal(calls.length, 2);
    throwingTag = true;
    trackPurchase(receipt("e"));
    throwingTag = false;
    location.hostname = "www.dexpoky.com";
    trackPurchase(receipt("e"));
    trackPurchase(receipt("e"));
    assert.equal(calls.length, 3);
    assert.equal(storage.size, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
