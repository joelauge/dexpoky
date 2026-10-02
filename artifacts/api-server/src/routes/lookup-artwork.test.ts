import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { PokeWalletCard } from "../lib/pokewallet.js";

const mockPwSearch = vi.hoisted(() => vi.fn());
const mockPwGetCard = vi.hoisted(() => vi.fn());
const mockSelectScanPrinting = vi.hoisted(() => vi.fn());
const mockSearchTcgdex = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: {},
  cardsTable: {},
  categoriesTable: {},
  collectionsTable: {},
  activityEventsTable: {},
}));

vi.mock("../middlewares/requireAuth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/pokewallet.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/pokewallet.js")>();
  return {
    ...actual,
    pwSearch: mockPwSearch,
    pwGetCard: mockPwGetCard,
  };
});

vi.mock("../lib/scan-printing-selection.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/scan-printing-selection.js")>();
  return { ...actual, selectScanPrinting: mockSelectScanPrinting };
});

vi.mock("./detect-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./detect-helpers.js")>();
  return { ...actual, searchTcgdex: mockSearchTcgdex };
});

import cardsRouter from "./cards.js";

const app = express();
app.use(express.json());
app.use(cardsRouter);

const POCKET_IMAGE = "https://assets.tcgdex.net/en/p/pocket/1";
const POCKET_IMAGE_2 = "https://assets.tcgdex.net/en/p/pocket/2";
const OBSIDIAN_IMAGE = "https://assets.tcgdex.net/en/sv/sv3/1";

// Synthetic regression fixtures only; they are not claims about live catalog availability.
const tcgdexSets = [
  { id: "anniversary", name: "Anniversary Collection" },
  { id: "pocket", name: "Pocket" },
  { id: "no-art", name: "No Art Set" },
  { id: "wrong-name", name: "Wrong Name Set" },
  { id: "wrong-set", name: "Wrong Set Set" },
  { id: "wrong-local", name: "Wrong Local ID Set" },
  { id: "wrong-id", name: "Wrong Card ID Set" },
  { id: "mee", name: "Mega Evolution" },
  { id: "sv3", name: "Obsidian Flames" },
];

const detailCards: Record<string, Record<string, unknown>> = {
  "anniversary-1": {
    id: "anniversary-1",
    localId: "1",
    name: "Exeggcute",
    set: { id: "anniversary", name: "Anniversary Collection" },
  },
  "pocket-1": {
    id: "pocket-1",
    localId: "1",
    name: "Exeggcute",
    image: POCKET_IMAGE,
    set: { id: "pocket", name: "Pocket" },
  },
  "anniversary-2": {
    id: "anniversary-2",
    localId: "2",
    name: "Exeggcute",
    set: { id: "anniversary", name: "Anniversary Collection" },
  },
  "pocket-2": {
    id: "pocket-2",
    localId: "2",
    name: "Exeggcute",
    image: POCKET_IMAGE_2,
    set: { id: "pocket", name: "Pocket" },
  },
  "no-art-1": {
    id: "no-art-1",
    localId: "1",
    name: "Exeggcute",
    set: { id: "no-art", name: "No Art Set" },
  },
  "wrong-name-1": {
    id: "wrong-name-1",
    localId: "1",
    name: "Exeggutor",
    image: "https://assets.tcgdex.net/en/w/wrong-name/1",
    set: { id: "wrong-name", name: "Wrong Name Set" },
  },
  "wrong-set-1": {
    id: "wrong-set-1",
    localId: "1",
    name: "Exeggcute",
    image: "https://assets.tcgdex.net/en/w/wrong-set/1",
    set: { id: "anniversary", name: "Anniversary Collection" },
  },
  "wrong-local-1": {
    id: "wrong-local-1",
    localId: "2",
    name: "Exeggcute",
    image: "https://assets.tcgdex.net/en/w/wrong-local/1",
    set: { id: "wrong-local", name: "Wrong Local ID Set" },
  },
  "wrong-id-1": {
    id: "some-other-card-1",
    localId: "1",
    name: "Exeggcute",
    image: "https://assets.tcgdex.net/en/w/wrong-id/1",
    set: { id: "wrong-id", name: "Wrong Card ID Set" },
  },
  "mee-1": {
    id: "mee-1",
    localId: "1",
    name: "Fire Energy",
    set: { id: "mee", name: "Mega Evolution" },
  },
  "sv3-1": {
    id: "sv3-1",
    localId: "1",
    name: "Fire Energy",
    image: OBSIDIAN_IMAGE,
    set: { id: "sv3", name: "Obsidian Flames" },
  },
};

const legacyListCards = Object.values(detailCards).map((card) => ({
  id: card.id,
  localId: card.localId,
  name: card.name,
  image: card.image ?? null,
}));

const searchResults: Record<string, PokeWalletCard[]> = {};
const priceDetails: Record<string, PokeWalletCard> = {};
let fetchMock: ReturnType<typeof vi.fn>;

function pokeWalletCard(
  id: string,
  name: string,
  setName: string,
  setCode: string,
  cardNumber: string,
  marketPrice: number,
): PokeWalletCard {
  return {
    id,
    card_info: {
      name,
      clean_name: name,
      set_name: setName,
      set_code: setCode,
      card_number: cardNumber,
      rarity: "Common",
    },
    tcgplayer: {
      prices: [{
        low_price: Math.round(marketPrice * 0.8 * 100) / 100,
        mid_price: marketPrice,
        high_price: marketPrice,
        market_price: marketPrice,
        direct_low_price: null,
        sub_type_name: "Normal",
      }],
    },
  };
}

function tcgdexResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  for (const key of Object.keys(searchResults)) delete searchResults[key];
  for (const key of Object.keys(priceDetails)) delete priceDetails[key];

  mockPwSearch.mockImplementation(async (query: string) => ({
    ok: true,
    data: { query, results: searchResults[query] ?? [] },
    remainingHour: null,
    remainingDay: null,
  }));
  mockPwGetCard.mockImplementation(async (id: string) => {
    const data = priceDetails[id];
    return data
      ? { ok: true, data, remainingHour: null, remainingDay: null }
      : { ok: false, reason: "NOT_FOUND" };
  });
  mockSelectScanPrinting.mockReset();
  mockSearchTcgdex.mockResolvedValue({
    variants: [],
    pricing: {
      marketPrice: null,
      lowPrice: null,
      trendPrice: null,
      source: null,
      psaEstimates: null,
    },
  });

  fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/sets")) return tcgdexResponse(tcgdexSets);

    const detailMatch = url.pathname.match(/\/cards\/([^/]+)$/);
    if (detailMatch) {
      const detail = detailCards[decodeURIComponent(detailMatch[1]!)];
      return detail ? tcgdexResponse(detail) : tcgdexResponse({}, 404);
    }

    if (url.pathname.endsWith("/cards")) return tcgdexResponse(legacyListCards);
    return tcgdexResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /cards/lookup artwork resolution", () => {
  it("keeps Anniversary and Pocket Exeggcute artwork scoped to each exact set", async () => {
    const pocket = pokeWalletCard(
      "pk_exeggcute_pocket",
      "Exeggcute",
      "Pocket",
      "POCKET",
      "1",
      2.5,
    );
    const anniversary = pokeWalletCard(
      "pk_exeggcute_anniversary",
      "Exeggcute",
      "Anniversary Collection",
      "ANN",
      "1",
      15.25,
    );
    anniversary.image_url = POCKET_IMAGE;
    const noArt = pokeWalletCard(
      "pk_exeggcute_no_art",
      "Exeggcute",
      "No Art Set",
      "NOART",
      "1",
      3.75,
    );
    const wrongName = pokeWalletCard(
      "pk_exeggcute_wrong_name",
      "Exeggcute",
      "Wrong Name Set",
      "WRONGNAME",
      "1",
      4.25,
    );
    const wrongSet = pokeWalletCard(
      "pk_exeggcute_wrong_set",
      "Exeggcute",
      "Wrong Set Set",
      "WRONGSET",
      "1",
      4.5,
    );
    const wrongLocal = pokeWalletCard(
      "pk_exeggcute_wrong_local",
      "Exeggcute",
      "Wrong Local ID Set",
      "WRONGLOCAL",
      "1",
      4.75,
    );
    const wrongId = pokeWalletCard(
      "pk_exeggcute_wrong_id",
      "Exeggcute",
      "Wrong Card ID Set",
      "WRONGID",
      "1",
      5,
    );
    const unresolved = pokeWalletCard(
      "pk_exeggcute_unresolved",
      "Exeggcute",
      "Unlisted Set",
      "UNLISTED",
      "1",
      5.25,
    );
    unresolved.image_url = "https://images.example.invalid/unverified-art.png";
    searchResults.Exeggcute = [
      pocket, anniversary, noArt, wrongName, wrongSet, wrongLocal, wrongId, unresolved,
    ];

    const response = await request(app).get("/cards/lookup?name=Exeggcute");

    expect(response.status).toBe(200);
    const variants = Object.fromEntries(
      response.body.variants.map((variant: { id: string }) => [variant.id, variant]),
    );
    expect(Object.keys(variants)).toEqual([
      "pk_exeggcute_pocket",
      "pk_exeggcute_anniversary",
      "pk_exeggcute_no_art",
      "pk_exeggcute_wrong_name",
      "pk_exeggcute_wrong_set",
      "pk_exeggcute_wrong_local",
      "pk_exeggcute_wrong_id",
      "pk_exeggcute_unresolved",
    ]);
    expect(variants.pk_exeggcute_pocket.imageUrl).toBe(`${POCKET_IMAGE}/high.webp`);
    expect(variants.pk_exeggcute_anniversary.imageUrl).toBe("");
    expect(variants.pk_exeggcute_pocket.imageUrl).not.toBe(variants.pk_exeggcute_anniversary.imageUrl);
    expect(variants.pk_exeggcute_no_art.imageUrl).toBe("");
    expect(variants.pk_exeggcute_wrong_name.imageUrl).toBe("");
    expect(variants.pk_exeggcute_wrong_set.imageUrl).toBe("");
    expect(variants.pk_exeggcute_wrong_local.imageUrl).toBe("");
    expect(variants.pk_exeggcute_wrong_id.imageUrl).toBe("");
    expect(variants.pk_exeggcute_unresolved.imageUrl).toBe("");
    expect(response.body.card.id).toBe("pk_exeggcute_pocket");
    expect(response.body.pricing.marketPrice).toBe(2.5);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/anniversary-1"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/pocket-1"),
      expect.anything(),
    );
  });

  it("matches MEE Fire Energy by its set code and retains the promoted printing's ID and price", async () => {
    const obsidian = pokeWalletCard(
      "pk_fire_energy_obsidian",
      "Fire Energy",
      "Obsidian Flames",
      "OBF",
      "1",
      4.99,
    );
    const mee = pokeWalletCard(
      "pk_fire_energy_mee",
      "Fire Energy",
      "",
      "MEE",
      "1",
      29.99,
    );
    mee.image_url = OBSIDIAN_IMAGE;
    searchResults["Fire Energy"] = [obsidian, mee];
    priceDetails[mee.id] = pokeWalletCard(
      mee.id,
      "Fire Energy",
      "",
      "MEE",
      "1",
      17.42,
    );
    mockSelectScanPrinting.mockResolvedValue({
      status: "exact",
      recommendedId: mee.id,
      confidence: null,
      message: "Exact fixture selection",
    });

    const response = await request(app)
      .get("/cards/lookup")
      .query({ name: "Fire Energy", resolvePrinting: "true" });

    expect(response.status).toBe(200);
    expect(response.body.card.id).toBe("pk_fire_energy_mee");
    expect(response.body.variants.map((variant: { id: string }) => variant.id)).toEqual([
      "pk_fire_energy_mee",
      "pk_fire_energy_obsidian",
    ]);
    expect(response.body.variants[0].imageUrl).toBe("");
    expect(response.body.variants[1].imageUrl).toBe(`${OBSIDIAN_IMAGE}/high.webp`);
    expect(response.body.pricing.marketPrice).toBe(17.42);
    expect(response.body.pricing.lowPrice).toBe(13.94);
    expect(response.body.selection.recommendedId).toBe("pk_fire_energy_mee");
    expect(mockPwGetCard).toHaveBeenCalledWith("pk_fire_energy_mee");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/mee-1"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/sv3-1"),
      expect.anything(),
    );
  });

  it("keeps the hinted exact PokeWallet ID and price when TCGdex has no search candidates", async () => {
    const obsidian = pokeWalletCard(
      "pk_hinted_fire_energy_obsidian",
      "Fire Energy",
      "Obsidian Flames",
      "OBF",
      "1",
      4.99,
    );
    const mee = pokeWalletCard(
      "pk_hinted_fire_energy_mee",
      "Fire Energy",
      "",
      "MEE",
      "1",
      22.37,
    );
    mee.image_url = OBSIDIAN_IMAGE;
    searchResults["Fire Energy"] = [obsidian, mee];

    const response = await request(app)
      .get("/cards/lookup")
      .query({ name: "Fire Energy", cardNumber: "1", setCode: "MEE" });

    expect(response.status).toBe(200);
    expect(response.body.card.id).toBe("pk_hinted_fire_energy_mee");
    expect(response.body.variants.map((variant: { id: string }) => variant.id)).toEqual([
      "pk_hinted_fire_energy_mee",
      "pk_hinted_fire_energy_obsidian",
    ]);
    expect(response.body.variants[0].imageUrl).toBe("");
    expect(response.body.variants[1].imageUrl).toBe(`${OBSIDIAN_IMAGE}/high.webp`);
    expect(response.body.pricing.marketPrice).toBe(22.37);
    expect(mockSearchTcgdex).toHaveBeenCalledWith("Fire Energy", "1", "MEE");
  });

  it("verifies fallback TCGdex artwork without changing variant IDs or pricing", async () => {
    const pricing = {
      marketPrice: 8.75,
      lowPrice: 2.5,
      trendPrice: 7.8,
      source: "tcgplayer",
      psaEstimates: { 10: 43.75, 9: 17.5 },
    };
    mockSearchTcgdex.mockResolvedValueOnce({
      variants: [
        {
          id: "anniversary-2",
          name: "Exeggcute",
          // Synthetic, deliberately unverified scanner artwork guesses.
          imageUrl: POCKET_IMAGE,
          setName: "Anniversary Collection",
          setId: "anniversary",
          cardNumber: "2",
          rarity: null,
        },
        {
          id: "pocket-2",
          name: "Exeggcute",
          imageUrl: "https://assets.tcgdex.net/en/a/anniversary/2/high.png",
          setName: "Pocket",
          setId: "pocket",
          cardNumber: "2",
          rarity: null,
        },
      ],
      pricing,
    });

    const response = await request(app)
      .get("/cards/lookup")
      .query({ name: "Exeggcute", cardNumber: "2", setCode: "ANN" });

    expect(response.status).toBe(200);
    expect(response.body.card.id).toBe("anniversary-2");
    expect(response.body.variants.map((variant: { id: string }) => variant.id)).toEqual([
      "anniversary-2",
      "pocket-2",
    ]);
    expect(response.body.variants[0].imageUrl).toBe("");
    expect(response.body.variants[1].imageUrl).toBe(`${POCKET_IMAGE_2}/high.webp`);
    expect(response.body.pricing).toEqual(pricing);
    expect(mockPwSearch).toHaveBeenCalledWith("Exeggcute", 100);
    expect(mockSearchTcgdex).toHaveBeenCalledWith("Exeggcute", "2", "ANN");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/anniversary-2"),
      expect.anything(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/pocket-2"),
      expect.anything(),
    );
  });
});