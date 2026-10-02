import { describe, expect, it } from "vitest";
import { verifiedEbaySales, type EbayTarget } from "./ebay-comparables.js";

const target: EbayTarget = { name: "Pikachu", setName: "Sample Set", cardNumber: "001/010", finish: "normal", condition: "near_mint" };
const now = new Date("2026-10-02T12:00:00Z");
export function row(title = "Pikachu Sample Set 001/010 English Non-Holo NM", price = "US $12.00", date = "Sold Oct 1, 2026", id = "123456789012") {
  return `<li class="s-item s-item__pl-on-bottom"><a class="s-item__link" href="https://www.ebay.com/itm/${id}?x=1"><div class="s-item__title">${title}</div></a><span class="s-item__price">${price}</span><span class="s-item__caption">${date}</span></li>`;
}

describe("individual eBay comparable verification", () => {
  it("keeps explicit compatible raw sales, dates and evidence without search inference", () => {
    expect(verifiedEbaySales(row(), target, now)).toEqual([expect.objectContaining({
      amount: 12, currency: "USD", soldAt: "2026-10-01", condition: "near_mint", finish: "normal",
      itemId: "123456789012", url: "https://www.ebay.com/itm/123456789012", evidence: expect.stringContaining("Seller title"),
    })]);
    expect(verifiedEbaySales(row() + row(), target, now)).toHaveLength(1);
  });
  it.each([
    "Pikachu Other Set 001/010 English Non-Holo NM",
    "Pikachu Sample Set 002/010 English Non-Holo NM",
    "Pikachu Sample Set 001/099 English Non-Holo NM",
    "Pikachu VMAX Sample Set 001/010 English Non-Holo NM",
    "Pikachu Sample Set 2 001/010 English Non-Holo NM",
    "Pikachu Sample Set 001/010 English Non-Holo NM lot",
    "Pikachu Sample Set 001/010 English Non-Holo NM PSA 10",
    "Pikachu Sample Set 001/010 English Non-Holo NM PSA",
    "Pikachu Sample Set 001/010 English Non-Holo NM 1st edition",
    "Pikachu Sample Set 001/010 English Non-Holo NM stamped",
    "Pikachu Sample Set 001/010 English Non-Holo NM Japanese",
    "Pikachu Sample Set 001/010 Non-Holo NM",
    "Pikachu Sample Set 001/010 English NM",
    "Pikachu Sample Set 001/010 English Holo NM",
    "Pikachu Sample Set 001/010 English Reverse Holo NM",
    "Pikachu Sample Set 001/010 English Non-Holo",
    "Pikachu Sample Set 001/010 English Non-Holo LP",
    "Pikachu Sample Set 001/010 English Non-Holo NM/M",
    "Pikachu Sample Set 001/010 English Non-Holo NM Mint",
    "Pikachu Sample Set 001/010 English Non-Holo NM possibly",
  ])("rejects ambiguous or incompatible seller title: %s", title => {
    expect(verifiedEbaySales(row(title), target, now)).toEqual([]);
  });
  it.each(["C $12.00", "AU $12.00", "€12.00", "$12.00 to $20.00", "$12", "$0.00", "$100,001.00"])("rejects unproven price %s", price => {
    expect(verifiedEbaySales(row(undefined, price), target, now)).toEqual([]);
  });
  it.each(["", "Sold Oct 3, 2026", "Sold Jan 1, 2026", "Ended Oct 1, 2026", "Sold Oct 1, 2026 Best offer accepted"])("rejects missing/stale/future date or offer: %s", date => {
    expect(verifiedEbaySales(row(undefined, undefined, date), target, now)).toEqual([]);
  });
  it("does not borrow evidence from neighboring rows", () => {
    expect(verifiedEbaySales(row(undefined, "US $12.00", "") + row("Other card", undefined, "Sold Oct 1, 2026"), target, now)).toEqual([]);
  });
  it("matches reverse, holo and lightly played independently and fails missing identities", () => {
    expect(verifiedEbaySales(row("Pikachu Sample Set 001/010 English Reverse Holo Near Mint"), { ...target, finish: "reverse_holofoil" }, now)).toHaveLength(1);
    expect(verifiedEbaySales(row("Pikachu Sample Set 001/010 English Holo LP"), { ...target, finish: "holofoil", condition: "light_played" }, now)).toHaveLength(1);
    expect(verifiedEbaySales(row(), { ...target, setName: null }, now)).toEqual([]);
  });
  it("requires a documented unlimited edition for vintage printings", () => {
    const vintage = { ...target, setName: "Base Set" };
    expect(verifiedEbaySales(row("Pikachu Base Set 001/010 English Non-Holo NM"), vintage, now)).toEqual([]);
    expect(verifiedEbaySales(row("Pikachu Base Set Unlimited 001/010 English Non-Holo NM"), vintage, now)).toHaveLength(1);
  });
});