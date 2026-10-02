import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let tcgcsv: typeof import("./tcgcsv.js");

const meeGroup = {
  groupId: 24461,
  name: "MEE: Mega Evolution Energies",
  abbreviation: "MEE",
  categoryId: 3,
};

function product(
  productId: number,
  name: string,
  number: string | undefined,
  options: { groupId?: number; categoryId?: number; imageCount?: number; imageUrl?: string; cardType?: string; pokemonStats?: boolean } = {},
) {
  const extendedData = [
    ...(number === undefined ? [] : [{ name: "Number", displayName: "Card Number", value: number }]),
    { name: "Rarity", displayName: "Rarity", value: "Common" },
    ...(options.cardType === "" ? [] : [{
      name: "Card Type",
      displayName: "Card Type",
      value: options.cardType ?? "Basic Energy",
    }]),
    ...(options.pokemonStats ? [
      { name: "HP", value: "60" },
      { name: "Stage", value: "Basic" },
    ] : []),
  ];
  return {
    productId,
    groupId: options.groupId ?? 24461,
    categoryId: options.categoryId ?? 3,
    name,
    imageUrl: options.imageUrl ?? `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
    imageCount: options.imageCount ?? 1,
    extendedData,
  };
}

const energyKinds = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal"];
const meeProducts = [
  ...energyKinds.map((kind, index) =>
    product(656263 + index, `Basic ${kind} Energy - ${String(index + 1).padStart(3, "0")}`, String(index + 1)),
  ),
  ...energyKinds.map((kind, index) =>
    product(713248 + index, `Basic ${kind} Energy - ${String(index + 9).padStart(3, "0")} (30th Celebration)`, String(index + 9).padStart(3, "0")),
  ),
  product(800001, "Energy Storage Box", undefined),
  product(800002, "Energy Promo without card type", "001", { cardType: "" }),
  product(800003, "Card without artwork", "TG01", { imageCount: 0 }),
  product(800004, "Card with insecure artwork", "TG02", { imageUrl: "http://example.test/card.jpg" }),
];

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function envelope(results: unknown[], totalItems = results.length) {
  return { success: true, errors: [], totalItems, results };
}

function installCatalog(
  options: {
    groups?: unknown[];
    products?: Record<number, unknown[]>;
    prices?: Record<number, unknown[]>;
    onRequest?: (url: URL) => void;
    groupTotalItems?: number;
    groupEnvelope?: (groups: unknown[]) => unknown;
    productEnvelope?: (groupId: number, offset: number, items: unknown[]) => unknown;
    priceEnvelope?: (groupId: number, items: unknown[]) => unknown;
  } = {},
) {
  const groups = options.groups ?? [meeGroup, {
    groupId: 2374,
    name: "Miscellaneous Cards & Products",
    abbreviation: "MCAP",
    categoryId: 3,
  }];
  const productSets = options.products ?? { 24461: meeProducts };
  const priceSets = options.prices ?? {};
  const fetchMock = vi.fn(async (rawUrl: string | URL) => {
    const url = new URL(String(rawUrl));
    options.onRequest?.(url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[1] === "3" && parts[2] === "groups") {
      return response(options.groupEnvelope?.(groups) ?? envelope(groups, options.groupTotalItems ?? groups.length));
    }
    if (parts[1] === "3" && parts[3] === "products") {
      const groupId = Number(parts[2]);
      const items = productSets[groupId] ?? [];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const page = items.slice(offset, offset + Number(url.searchParams.get("limit") ?? 500));
      return response(options.productEnvelope?.(groupId, offset, page) ?? envelope(page, items.length));
    }
    if (parts[1] === "3" && parts[3] === "prices") {
      const groupId = Number(parts[2]);
      const items = priceSets[groupId] ?? [];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const page = items.slice(offset, offset + Number(url.searchParams.get("limit") ?? 500));
      return response(options.priceEnvelope?.(groupId, page) ?? envelope(page, items.length));
    }
    return response({ success: false, totalItems: 0, results: [] }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(async () => {
  vi.resetModules();
  tcgcsv = await import("./tcgcsv.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("TCGCSV Pokemon provider", () => {
  it("recognizes only namespaced IDs with strict positive integer components", () => {
    expect(tcgcsv.isTcgcsvId("tcgcsv_24461_713249")).toBe(true);
    for (const id of [
      "tcgcsv_0_713249",
      "tcgcsv_024461_713249",
      "tcgcsv_24461_0",
      "tcgcsv_24461_713249x",
      "tcgcsv_-1_713249",
      "tcgcsv_9007199254740992_2",
      "tcgcsv_24461_713249_1",
    ]) {
      expect(tcgcsv.isTcgcsvId(id), id).toBe(false);
    }
  });

  it("finds MEE originals and all eight 30th Celebration printings from exact metadata", async () => {
    const fetchMock = installCatalog();
    const results = await tcgcsv.searchTcgcsv("Energy", undefined, "MEE");
    expect(results).toHaveLength(16);
    expect(results.map((card) => card.name)).toContain("Basic Fire Energy - 010 (30th Celebration)");
    expect(results.map((card) => card.cardNumber)).toEqual(expect.arrayContaining(["1", "2", "3", "4", "5", "6", "7", "8", "009", "010", "011", "012", "013", "014", "015", "016"]));
    expect(results.find((card) => card.id === "tcgcsv_24461_713249")).toMatchObject({
      name: "Basic Fire Energy - 010 (30th Celebration)",
      cardNumber: "010",
      setName: "MEE: Mega Evolution Energies",
      setId: "mee",
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringContaining("/3/groups"),
      expect.stringContaining("/3/24461/products"),
    ]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/3/2374/products"))).toBe(false);
  });

  it("requires number and card-type metadata, and only retains safe catalog artwork", async () => {
    installCatalog({
      products: {
        24461: [...meeProducts, product(800005, "Special Energy - 003", "003", { cardType: "Energies" })],
      },
    });
    const energyResults = await tcgcsv.searchTcgcsv("Energy", undefined, "MEE");
    expect(energyResults.some((card) => card.name === "Energy Storage Box")).toBe(false);
    expect(energyResults.some((card) => card.name === "Energy Promo without card type")).toBe(false);
    expect(energyResults.some((card) => card.name === "Special Energy - 003")).toBe(true);
    const artResults = await tcgcsv.searchTcgcsv("Card", undefined, "MEE");
    expect(artResults.find((card) => card.name === "Card without artwork")?.imageUrl).toBe("");
    expect(artResults.find((card) => card.name === "Card with insecure artwork")?.imageUrl).toBe("");
  });

  it("includes numbered Trainer and Tool cards alongside Energy cards", async () => {
    installCatalog({
      groups: [{ groupId: 90, name: "TST: Test Set", abbreviation: "TST", categoryId: 3 }],
      products: {
        90: [
          product(901, "Pokemon Supporter - 001", "001", { groupId: 90, cardType: "Trainer" }),
          product(902, "Pokemon Tool - 002", "002", { groupId: 90, cardType: "Tool" }),
          product(903, "Deck Box - 003", "003", { groupId: 90, cardType: "Accessory" }),
        ],
      },
    });
    const cards = await tcgcsv.searchTcgcsv("Pokemon", undefined, "TST");
    expect(cards.map((card) => card.id)).toEqual(["tcgcsv_90_901", "tcgcsv_90_902"]);
  });

  it("includes numbered Pokemon with verified type/stage/HP metadata but not color-coded merchandise", async () => {
    installCatalog({
      groups: [{ groupId: 91, name: "MON: Test Monsters", abbreviation: "MON", categoryId: 3 }],
      products: {
        91: [
          product(911, "Spinarak", "001/088", { groupId: 91, cardType: "Grass", pokemonStats: true }),
          product(912, "Green Card Sleeve - 002", "002", { groupId: 91, cardType: "Grass" }),
        ],
      },
    });
    const cards = await tcgcsv.searchTcgcsv("Spinarak", undefined, "MON");
    expect(cards.map((card) => card.id)).toEqual(["tcgcsv_91_911"]);
    expect(cards[0]?.cardNumber).toBe("001/088");
  });

  it("uses explicit aliases only and does not merge Base, Shadowless, or unrelated promos", async () => {
    const groups = [
      { groupId: 10, name: "BAS: Base Set", abbreviation: "BAS", categoryId: 3 },
      { groupId: 11, name: "SHD: Shadowless", abbreviation: "SHD", categoryId: 3 },
      { groupId: 12, name: "Promo Cards", abbreviation: "PRM", categoryId: 3 },
    ];
    const fetchMock = installCatalog({
      groups,
      products: {
        10: [product(100, "Fire Energy - 001", "001", { groupId: 10 })],
        11: [product(110, "Fire Energy - 001", "001", { groupId: 11 })],
        12: [product(120, "Fire Energy - 001", "001", { groupId: 12 })],
      },
    });
    const base = await tcgcsv.searchTcgcsv("Fire Energy", undefined, "BAS");
    expect(base.map((card) => card.id)).toEqual(["tcgcsv_10_100"]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/3/11/products"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/3/12/products"))).toBe(false);
  });

  it("returns a matched group-name prefix as the search set code, normalized for identifier gates", async () => {
    const group = {
      groupId: 77,
      name: "SV07: Stellar Crown",
      abbreviation: "SCR",
      categoryId: 3,
    };
    installCatalog({
      groups: [group],
      products: {
        77: [product(770, "Fire Energy - 001", "001", { groupId: 77 })],
      },
    });
    const results = await tcgcsv.searchTcgcsv("Fire Energy", undefined, "SV07");
    expect(results).toHaveLength(1);
    expect(results[0]?.setId).toBe("sv7");
    await expect(tcgcsv.getTcgcsvCard("tcgcsv_77_770")).resolves.toMatchObject({ setId: "SCR" });
  });

  it("paginates complete product catalogs instead of truncating at an arbitrary result count", async () => {
    const many = Array.from({ length: 501 }, (_, index) =>
      product(900000 + index, `Unique Card ${index}`, `TG${index + 1}`),
    );
    const fetchMock = installCatalog({ products: { 24461: many } });
    const results = await tcgcsv.searchTcgcsv("Unique Card", undefined, "MEE");
    expect(results).toHaveLength(501);
    const productUrls = fetchMock.mock.calls
      .map(([url]) => new URL(String(url)))
      .filter((url) => url.pathname.endsWith("/products"));
    expect(productUrls.map((url) => url.searchParams.get("offset"))).toEqual(["0", "500"]);
  });

  it("accepts a complete unpaginated TCGCSV response larger than the requested page size", async () => {
    const many = Array.from({ length: 501 }, (_, index) =>
      product(910000 + index, `Complete Catalog Card ${index}`, `TG${index + 1}`),
    );
    installCatalog({
      products: { 24461: many },
      productEnvelope: (_groupId, _offset, _page) => envelope(many),
    });
    expect(await tcgcsv.searchTcgcsv("Complete Catalog", undefined, "MEE")).toHaveLength(501);
  });

  it("accepts TCGCSV's successful empty-product envelope only when results are explicitly empty", async () => {
    installCatalog({
      groups: [meeGroup, {
        groupId: 23095,
        name: "Ash vs Team Rocket Deck Kit (JP Exclusive)",
        abbreviation: "",
        categoryId: 3,
      }],
      products: { 24461: [product(713249, "Basic Fire Energy - 010 (30th Celebration)", "010")], 23095: [] },
      productEnvelope: (groupId, _offset, page) => groupId === 23095
        ? { success: true, errors: [], results: [] }
        : envelope(page),
    });
    expect(await tcgcsv.searchTcgcsv("Fire Energy")).toHaveLength(1);

    vi.resetModules();
    tcgcsv = await import("./tcgcsv.js");
    installCatalog({
      products: { 24461: [product(713249, "Basic Fire Energy - 010 (30th Celebration)", "010")] },
      productEnvelope: (_groupId, _offset, page) => ({ success: true, errors: [], results: page }),
    });
    expect(await tcgcsv.searchTcgcsv("Fire Energy", undefined, "MEE")).toEqual([]);
  });

  it("rejects incomplete or invalid catalog responses rather than returning partial matches", async () => {
    installCatalog({
      products: { 24461: [product(1, "Fire Energy - 001", "001"), product(2, "Fire Energy - 002", "002")] },
      productEnvelope: (_groupId, offset, page) => envelope(offset === 0 ? page.slice(0, 1) : [], 2),
    });
    expect(await tcgcsv.searchTcgcsv("Fire Energy", undefined, "MEE")).toEqual([]);

    vi.resetModules();
    tcgcsv = await import("./tcgcsv.js");
    installCatalog({ groups: [meeGroup, { ...meeGroup }] });
    expect(await tcgcsv.searchTcgcsv("Energy", undefined, "MEE")).toEqual([]);
  });

  it("times out failed upstream requests and returns the provider's empty result", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = tcgcsv.searchTcgcsv("Energy");
    await vi.advanceTimersByTimeAsync(10_001);
    expect(await pending).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches successful group and product collections across keystroke searches", async () => {
    const fetchMock = installCatalog();
    expect(await tcgcsv.searchTcgcsv("Basic Fire Energy", undefined, "MEE")).toHaveLength(2);
    expect(await tcgcsv.searchTcgcsv("Basic Water Energy", undefined, "MEE")).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("joins prices only to the selected product and prefers its Normal row", async () => {
    installCatalog({
      prices: {
        24461: [
          { productId: 700000, subTypeName: "Normal", marketPrice: 99, lowPrice: 90, midPrice: 95 },
          { productId: 713249, subTypeName: "Holofoil", marketPrice: 20, lowPrice: 18, midPrice: 19 },
          { productId: 713249, subTypeName: "Normal", marketPrice: 5, lowPrice: 3, midPrice: 4 },
        ],
      },
    });
    await expect(tcgcsv.getTcgcsvPricing("tcgcsv_24461_713249")).resolves.toEqual({
      marketPrice: 5,
      lowPrice: 3,
      trendPrice: 4,
      source: "tcgplayer",
      psaEstimates: null,
    });
  });

  it("returns no pricing when no selected-product row exists", async () => {
    installCatalog({
      prices: {
        24461: [{ productId: 700000, subTypeName: "Normal", marketPrice: 99, lowPrice: 90, midPrice: 95 }],
      },
    });
    await expect(tcgcsv.getTcgcsvPricing("tcgcsv_24461_713249")).resolves.toEqual({
      marketPrice: null,
      lowPrice: null,
      trendPrice: null,
      source: null,
      psaEstimates: null,
    });
  });

  it("reads complete static price arrays without totalItems and selects each exact product's supported finish", async () => {
    const priceRows = [
      { productId: 713249, subTypeName: "Holofoil", marketPrice: 0.20, lowPrice: 0.04, midPrice: 0.25 },
      { productId: 656264, subTypeName: "Normal", marketPrice: 0.11, lowPrice: 0.03, midPrice: 0.11 },
      { productId: 656264, subTypeName: "Reverse Holofoil", marketPrice: 0.24, lowPrice: 0.10, midPrice: 0.24 },
      ...Array.from({ length: 21 }, (_, index) => ({
        productId: 800000 + index,
        subTypeName: "Normal",
        marketPrice: 1,
        lowPrice: 0.5,
        midPrice: 0.75,
      })),
    ];
    const fetchMock = installCatalog({
      prices: { 24461: priceRows },
      priceEnvelope: (_groupId, rows) => ({ success: true, errors: [], results: rows }),
    });

    await expect(tcgcsv.getTcgcsvPricing("tcgcsv_24461_713249")).resolves.toEqual({
      marketPrice: 0.20,
      lowPrice: 0.04,
      trendPrice: 0.25,
      source: "tcgplayer",
      psaEstimates: null,
    });
    await expect(tcgcsv.getTcgcsvPricing("tcgcsv_24461_656264")).resolves.toEqual({
      marketPrice: 0.11,
      lowPrice: 0.03,
      trendPrice: 0.11,
      source: "tcgplayer",
      psaEstimates: null,
    });
    const priceUrl = fetchMock.mock.calls.map(([url]) => new URL(String(url))).find((url) => url.pathname.endsWith("/prices"));
    expect(priceUrl?.search).toBe("");
  });

  it("keeps nonempty group and product envelopes strict while handling prices as a static array", async () => {
    const missingGroupTotal = installCatalog({
      groupEnvelope: (groups) => ({ success: true, errors: [], results: groups }),
    });
    expect(await tcgcsv.searchTcgcsv("Fire Energy", undefined, "MEE")).toEqual([]);
    expect(missingGroupTotal.mock.calls).toHaveLength(1);

    vi.resetModules();
    tcgcsv = await import("./tcgcsv.js");
    installCatalog({
      productEnvelope: (_groupId, _offset, rows) => ({ success: true, errors: [], results: rows }),
    });
    expect(await tcgcsv.searchTcgcsv("Fire Energy", undefined, "MEE")).toEqual([]);
  });

  it("returns a detail only for a numbered product owned by the exact requested group", async () => {
    installCatalog({
      products: { 24461: [product(713249, "Basic Fire Energy - 010 (30th Celebration)", "010")] },
    });
    await expect(tcgcsv.getTcgcsvCard("tcgcsv_24461_713249")).resolves.toMatchObject({
      id: "tcgcsv_24461_713249",
      cardNumber: "010",
    });
    await expect(tcgcsv.getTcgcsvCard("tcgcsv_2374_713249")).resolves.toBeNull();
    await expect(tcgcsv.getTcgcsvCard("tcgcsv_24461_999999")).resolves.toBeNull();
  });

  it("classifies only exact TCGCSV Card Type values and structured elemental Pokemon", async () => {
    installCatalog({
      products: {
        24461: [
          product(900001, "Basic Fire Energy", "001", { cardType: "Basic Energy" }),
          product(900002, "Energy", "002", { cardType: "Energies" }),
          product(900003, "Professor's Research", "003", { cardType: "Trainer" }),
          product(900004, "Tool", "004", { cardType: "Tool" }),
          product(900005, "Supporter", "005", { cardType: "Supporter" }),
          product(900006, "Card", "006", { cardType: "Grass", pokemonStats: true }),
          product(900007, "Card", "007", { cardType: "Grass" }),
          product(900008, "Basic Fire Energy", "008", { cardType: "" }),
          product(900009, "Card", "009", { cardType: "Pokemon Supporter" }),
        ],
      },
    });

    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900001")).resolves.toBe("Energy");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900002")).resolves.toBe("Energy");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900003")).resolves.toBe("Trainer");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900004")).resolves.toBe("Trainer");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900005")).resolves.toBe("Trainer");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900006")).resolves.toBe("Pokemon");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900007")).resolves.toBe("Unknown");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900008")).resolves.toBe("Unknown");
    await expect(tcgcsv.getTcgcsvCardCategory("tcgcsv_24461_900009")).resolves.toBe("Unknown");
    await expect(tcgcsv.getTcgcsvCardCategory("invalid-id")).resolves.toBeNull();
  });
});