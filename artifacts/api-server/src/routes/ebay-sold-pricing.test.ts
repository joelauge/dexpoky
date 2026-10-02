import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEbaySoldPricing } from "./detect-helpers.js";

function soldRow(id: string, name: string, amount: number) {
  const sold = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(Date.now() - 86400_000));
  return `<li class="s-item"><a href="https://www.ebay.com/itm/${id}"><div class="s-item__title">${name} Sample Set 001/010 English Non-Holo NM</div></a><span class="s-item__price">US $${amount.toFixed(2)}</span><span>Sold ${sold}</span></li>`;
}
afterEach(() => vi.unstubAllGlobals());
describe("eBay sold fetch integration", () => {
  it("returns documented sales even when the legacy median has insufficient samples and isolates finish/condition caches", async () => {
    const fetchMock = vi.fn(async () => new Response(soldRow("123456789012", "Integration Pikachu", 12)));
    vi.stubGlobal("fetch", fetchMock);
    const target = { name: "Integration Pikachu", setName: "Sample Set", cardNumber: "001/010", finish: "normal", condition: "near_mint" as const };
    const result = await fetchEbaySoldPricing(target.name, target.setName, target.cardNumber, target);
    expect(result?.verifiedSales).toHaveLength(1);
    expect(result?.verifiedSales?.[0]?.amount).toBe(12);
    await fetchEbaySoldPricing(target.name, target.setName, target.cardNumber, target);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await fetchEbaySoldPricing(target.name, target.setName, target.cardNumber, { ...target, condition: "mint" })).toBeNull();
    expect(await fetchEbaySoldPricing(target.name, target.setName, target.cardNumber, { ...target, finish: "holofoil" })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("leaves generic sold medians unverified", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      [10, 20, 30].map((amount, i) => soldRow(`23456789012${i}`, "Reference Pikachu", amount)).join(""),
    )));
    const result = await fetchEbaySoldPricing("Reference Pikachu", "Sample Set", "001/010");
    expect(result?.median).toBe(20);
    expect(result?.verifiedSales).toEqual([]);
  });
});