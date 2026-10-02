import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const providers = vi.hoisted(() => ({
  card: null as any,
  pwResult: null as any,
  pwSearchResults: [] as any[],
  csvCard: null as any,
  csvRows: [] as any[],
  ebay: null as any,
}));

vi.mock("./pokewallet.js", () => ({
  normalizeCatalogCard: (raw: any) => ({
    id: raw.id,
    name: raw.card_info.clean_name ?? raw.card_info.name,
    pokemonName: raw.card_info.name,
    setName: raw.card_info.set_name ?? "",
    setCode: raw.card_info.set_code ?? "",
    cardNumber: raw.card_info.card_number ?? "",
    rarity: null,
    imageUrl: raw.image_url ?? "",
    marketPrice: null,
    tcgplayerUrl: raw.tcgplayer?.url ?? null,
    cardmarketUrl: raw.cardmarket?.product_url ?? null,
  }),
  pwGetCard: vi.fn(async () => providers.pwResult ?? { ok: true, data: providers.card }),
  pwSearch: vi.fn(async () => ({ ok: true, data: { query: "", results: providers.pwSearchResults }, remainingHour: null, remainingDay: null })),
}));

vi.mock("./tcgcsv.js", () => ({
  getTcgcsvCard: vi.fn(async () => providers.csvCard),
  getTcgcsvPriceVariants: vi.fn(async () => providers.csvRows),
}));

vi.mock("../routes/detect-helpers.js", () => ({
  fetchEbaySoldPricing: vi.fn(async () => providers.ebay),
}));

import { lookupCardPrices } from "./price-lookup-service.js";

const baseCard = () => ({
  id: "pk_pikachu",
  card_info: {
    name: "Pikachu",
    clean_name: "Pikachu",
    set_name: "Sample Set",
    set_code: "smp",
    card_number: "001/010",
  },
  image_url: "https://images.example/pikachu.png",
  tcgplayer: { url: "https://tcgplayer.example/product/1", prices: [
    { sub_type_name: "Normal", market_price: 10, updated_at: "2025-01-01" },
    { sub_type_name: "Holofoil", market_price: 20, updated_at: "2025-01-02" },
    { sub_type_name: "Reverse Holofoil", market_price: 30, updated_at: "2025-01-03" },
  ] },
  cardmarket: { product_url: "https://cardmarket.example/product/1", prices: [
    { variant_type: "normal", trend: 8, updated_at: "2025-01-01" },
    { variant_type: "holo", trend: 18, updated_at: "2025-01-02" },
    { variant_type: "reverse", trend: 28, updated_at: "2025-01-03" },
  ] },
});

const baseCsvCard = () => ({
  id: "tcgcsv_1_2",
  name: "Pikachu - 001/010",
  setName: "Sample Set",
  setId: "smp",
  cardNumber: "001/010",
  imageUrl: "",
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function installFetch(options: {
  fx?: unknown | null;
  jev?: unknown | null;
  tcgdex?: unknown | null;
} = {}) {
  const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    if (url.includes("api.typesafe.ai")) {
      if (options.jev == null) return jsonResponse({ answers: {} });
      if (typeof options.jev === "function") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return jsonResponse(options.jev(body));
      }
      return jsonResponse(options.jev);
    }
    if (url.includes("frankfurter")) {
      return options.fx == null ? jsonResponse({}, 503) : jsonResponse(options.fx);
    }
    if (url.includes("api.tcgdex.net")) {
      return options.tcgdex == null ? jsonResponse({}, 404) : jsonResponse(options.tcgdex);
    }
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jevChoice(choice: string, confidence = 0.9) {
  return (body: any) => {
    const options = Object.keys(body.questions.recommendation.criteria);
    const probabilities = Object.fromEntries(options.map((option: string) => [
      option,
      option === choice ? 0.9 : 0.1 / Math.max(options.length - 1, 1),
    ]));
    return { model: "jev-latest", answers: { recommendation: { type: "choice", choice, confidence, probabilities } } };
  };
}

beforeEach(() => {
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  providers.card = baseCard();
  providers.pwResult = null;
  providers.pwSearchResults = [];
  providers.csvCard = null;
  providers.csvRows = [];
  providers.ebay = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("lookupCardPrices", () => {
  it("maps every requested finish exactly and prefers one PokeWallet TCGPlayer mirror", async () => {
    installFetch({ jev: jevChoice("tcgplayer") });
    providers.csvCard = baseCsvCard();
    providers.pwSearchResults = [baseCard()];
    providers.csvRows = [
      { finish: "Normal", marketPrice: 999 },
      { finish: "Holofoil", marketPrice: 998 },
      { finish: "Reverse Holofoil", marketPrice: 997 },
    ];
    const normal = await lookupCardPrices("tcgcsv_1_2", "normal");
    const holo = await lookupCardPrices("tcgcsv_1_2", "holofoil");
    const reverse = await lookupCardPrices("tcgcsv_1_2", "reverse_holofoil");
    expect(normal.quotes[0]).toMatchObject({ amount: 10, finish: "normal" });
    expect(holo.quotes[0]).toMatchObject({ amount: 20, finish: "holofoil" });
    expect(reverse.quotes[0]).toMatchObject({ amount: 30, finish: "reverse_holofoil" });
    expect(normal.averageSourceCount).toBe(1);
    expect(normal.quotes[0]?.amount).not.toBe(999);
  });

  it("uses exact TCGdex detail finish pricing only as the mirror fallback", async () => {
    const card = baseCard();
    card.tcgplayer.prices = [];
    card.cardmarket.prices = [];
    const detail = {
      id: "smp-001",
      localId: "001",
      name: "Pikachu",
      image: "https://assets.example/pikachu",
      set: { id: "smp", name: "Sample Set" },
      variants_detailed: [
        { type: "normal", pricing: { tcgplayer: { normal: { marketPrice: 1 } } } },
        { type: "holo", pricing: { tcgplayer: { holofoil: { marketPrice: 2 } } } },
        { type: "reverse", pricing: { tcgplayer: { reverse_holofoil: { marketPrice: 3 } } } },
      ],
    };
    providers.card = card;
    installFetch({ tcgdex: detail, jev: jevChoice("tcgplayer") });
    const result = await lookupCardPrices("pk_pikachu", "reverse_holofoil");
    expect(result.quotes[0]).toMatchObject({
      status: "available",
      amount: 3,
      basis: expect.stringContaining("exact reverse_holofoil finish"),
    });
  });

  it("accepts a single TCGdex Holofoil variant and reads its market/trend fields", async () => {
    providers.card.tcgplayer.prices = [];
    providers.card.cardmarket.prices = [];
    const detail = {
      id: "smp-001",
      localId: "001",
      name: "Pikachu",
      set: { id: "smp", name: "Sample Set" },
      variants_detailed: [{
        type: "holo",
        pricing: {
          tcgplayer: { updated: "2026-10-01T22:55:05Z", holofoil: { marketPrice: 1.3 } },
          cardmarket: { updated: "2026-10-01T22:54:33Z", avg: 2.3, trend: 2.08 },
        },
      }],
    };
    installFetch({ tcgdex: detail });
    const result = await lookupCardPrices("pk_pikachu", "holofoil");
    expect(result.quotes[0]).toMatchObject({ amount: 1.3, basis: expect.stringContaining("market price") });
    expect(result.quotes[1]).toMatchObject({ amount: 2.08, currency: "EUR" });
  });

  it("uses the matching TCGCSV product row for the requested finish without borrowing its Normal row", async () => {
    providers.card.tcgplayer.prices = [];
    providers.card.cardmarket.prices = [];
    providers.csvCard = baseCsvCard();
    providers.csvRows = [
      { finish: "Normal", marketPrice: 12 },
      { finish: "Reverse Holofoil", marketPrice: 34 },
    ];
    installFetch({ jev: jevChoice("tcgplayer") });
    const result = await lookupCardPrices("tcgcsv_1_2", "reverse_holofoil");
    expect(result.quotes[0]).toMatchObject({
      amount: 34,
      finish: "reverse_holofoil",
      basis: expect.stringContaining("exact reverse_holofoil finish"),
    });
  });

  it("keeps Cardmarket EUR visible but ineligible when FX is unavailable", async () => {
    installFetch({ jev: jevChoice("tcgplayer") });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.quotes[0]).toMatchObject({ amount: 10, currency: "USD", eligible: true });
    expect(result.quotes[1]).toMatchObject({
      status: "available",
      amount: 8,
      currency: "EUR",
      valueUsd: null,
      eligible: false,
      reason: expect.stringContaining("recent exchange rate"),
    });
    expect(result.averageUsd).toBe(10);
    expect(result.averageSourceCount).toBe(1);
    expect(result.fx).toBeNull();
  });

  it("refuses an FX rate older than seven days for Cardmarket comparisons", async () => {
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    installFetch({
      fx: { amount: 1, base: "EUR", date: oldDate, rates: { USD: 1.25 } },
      jev: jevChoice("tcgplayer"),
    });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.fx).toBeNull();
    expect(result.quotes[1]).toMatchObject({ status: "available", valueUsd: null, eligible: false });
    expect(result.averageSourceCount).toBe(1);
  });

  it("preserves legitimate zero values and does not count eBay contextual references", async () => {
    providers.card.tcgplayer.prices = [
      { sub_type_name: "Normal", market_price: 0 },
    ];
    providers.card.cardmarket.prices = [];
    providers.ebay = {
      median: 50,
      average: 51,
      low: 40,
      high: 60,
      count: 5,
      searchUrl: "https://ebay.example/search",
    };
    installFetch({ jev: jevChoice("tcgplayer") });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.quotes[0]).toMatchObject({ status: "available", amount: 0, valueUsd: 0, eligible: true });
    expect(result.quotes[2]).toMatchObject({ status: "reference_only", amount: 50, eligible: false });
    expect(result.averageUsd).toBe(0);
    expect(result.averageSourceCount).toBe(1);
  });

  it("keeps empty exact finish rows unavailable without borrowing another finish", async () => {
    providers.card.tcgplayer.prices = [
      { sub_type_name: "Normal", market_price: 10 },
    ];
    providers.card.cardmarket.prices = [
      { variant_type: "normal", trend: 8 },
    ];
    installFetch();
    const result = await lookupCardPrices("pk_pikachu", "holofoil");
    expect(result.quotes[0]).toMatchObject({ status: "unavailable", amount: null, eligible: false });
    expect(result.quotes[1]).toMatchObject({ status: "unavailable", amount: null, eligible: false });
    expect(result.averageUsd).toBeNull();
    expect(result.advice).toMatchObject({ status: "skipped", recommendedOption: "none" });
  });

  it("rejects Jev recommendations outside the code-eligible choices", async () => {
    const fetchMock = installFetch({ jev: jevChoice("cardmarket") });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.quotes[1]?.eligible).toBe(false);
    expect(result.advice).toMatchObject({ status: "unavailable", recommendedOption: "none" });
    const requestBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("api.typesafe.ai"))?.[1]?.body));
    expect(Object.keys(requestBody.questions.recommendation.criteria)).not.toContain("cardmarket");
    expect(Object.keys(requestBody.questions.recommendation.criteria)).not.toContain("average");
  });

  it("converts eligible mixed-currency quotes using the dated Frankfurter rate", async () => {
    installFetch({
      fx: { amount: 1, base: "EUR", date: new Date().toISOString().slice(0, 10), rates: { USD: 1.25 } },
      jev: jevChoice("average"),
    });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.fx).toMatchObject({ eurToUsd: 1.25, source: "Frankfurter" });
    expect(result.quotes[1]).toMatchObject({ amount: 8, currency: "EUR", valueUsd: 10, eligible: true });
    expect(result.averageUsd).toBe(10);
    expect(result.averageSourceCount).toBe(2);
  });

  it("reports advisory failures without suppressing valid prices", async () => {
    installFetch({ jev: { answers: { recommendation: { type: "choice", choice: "unknown" } } } });
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.quotes[0]).toMatchObject({ status: "available", amount: 10 });
    expect(result.advice).toMatchObject({ status: "unavailable", recommendedOption: "none" });
  });

  it("withholds weak Jev recommendations and never offers average for one source", async () => {
    const fetchMock = installFetch({ jev: jevChoice("tcgplayer", 0.45) });
    providers.card.cardmarket.prices = [];
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.averageSourceCount).toBe(1);
    expect(result.advice).toMatchObject({ status: "unavailable", recommendedOption: "none" });
    const requestBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("api.typesafe.ai"))?.[1]?.body));
    expect(Object.keys(requestBody.questions.recommendation.criteria)).not.toContain("average");
  });

  it("rejects an attempted average recommendation when only one source is eligible", async () => {
    const fetchMock = installFetch({ jev: jevChoice("average") });
    providers.card.cardmarket.prices = [];
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.averageSourceCount).toBe(1);
    expect(result.advice).toMatchObject({ status: "unavailable", recommendedOption: "none" });
    const requestBody = JSON.parse(String(fetchMock.mock.calls.find(([url]) => String(url).includes("api.typesafe.ai"))?.[1]?.body));
    expect(Object.keys(requestBody.questions.recommendation.criteria)).not.toContain("average");
  });

  it("throws a descriptive error when no provider can resolve the catalog identity", async () => {
    providers.pwResult = { ok: false, reason: "NOT_FOUND" };
    installFetch();
    await expect(lookupCardPrices("missing_id", "normal")).rejects.toThrow(/Unable to resolve card identity.*missing_id/);
  });

  it("resolves the stored tcgdex_ catalog-ID namespace to the exact TCGdex detail", async () => {
    const detail = {
      id: "smp-001",
      localId: "001",
      name: "Pikachu",
      set: { id: "smp", name: "Sample Set" },
      variants_detailed: [],
    };
    providers.pwResult = { ok: false, reason: "NOT_FOUND" };
    installFetch({ tcgdex: detail });
    const result = await lookupCardPrices("tcgdex_smp-001", "normal");
    expect(result.card).toMatchObject({ id: "smp-001", name: "Pikachu", setName: "Sample Set" });
  });

  it("makes Jev advice explicitly unavailable when its server-only key is missing", async () => {
    vi.stubEnv("TYPESAFE_API_KEY", "");
    installFetch();
    const result = await lookupCardPrices("pk_pikachu", "normal");
    expect(result.quotes[0]).toMatchObject({ status: "available", amount: 10 });
    expect(result.advice).toMatchObject({ status: "unavailable", recommendedOption: "none" });
    expect(result.advice.message).toContain("temporarily unavailable");
  });
});