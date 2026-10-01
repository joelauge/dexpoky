import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function tcgcsvEnvelope(results: unknown[]) {
  return { success: true, errors: [], totalItems: results.length, results };
}

function energyProduct(productId: number, number: number, kind = "Grass") {
  const collectorNumber = String(number).padStart(3, "0");
  return {
    productId,
    groupId: 24461,
    categoryId: 3,
    name: `Basic ${kind} Energy - ${collectorNumber}`,
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
    imageCount: 1,
    extendedData: [
      { name: "Number", value: String(number) },
      { name: "Card Type", value: "Basic Energy" },
      { name: "Rarity", value: "Common" },
    ],
  };
}

const mee = {
  groupId: 24461,
  categoryId: 3,
  name: "MEE: Mega Evolution Energies",
  abbreviation: "MEE",
};

async function mountRouter() {
  vi.resetModules();
  const { default: pokemonRouter } = await import("./pokemon.js");
  const app = express();
  app.use(pokemonRouter);
  return app;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pokemon set routes", () => {
  it("lists only verified MEE source-only cards and counts its numbered checklist", async () => {
    const energyKinds = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal"];
    const products = Array.from({ length: 16 }, (_, index) =>
      energyProduct(7000 + index, index + 1, energyKinds[index % energyKinds.length]!),
    );
    const groups = [mee, {
      groupId: 300,
      categoryId: 3,
      name: "JT: Journey Together",
      abbreviation: "JT",
    }, {
      groupId: 2374,
      categoryId: 3,
      name: "Miscellaneous Cards & Products",
      abbreviation: "MCAP",
    }];
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net" && url.pathname.endsWith("/sets")) {
        return json([{ id: "sv09", name: "Journey Together", cardCount: { official: 190 } }]);
      }
      if (url.pathname.endsWith("/groups")) return json(tcgcsvEnvelope(groups));
      if (url.pathname.endsWith("/products")) {
        const groupId = Number(url.pathname.split("/")[3]);
        return json(tcgcsvEnvelope(groupId === 24461 ? products : []));
      }
      return json({ success: false, errors: [], results: [] }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = await mountRouter();
    const response = await request(app).get("/pokemon/sets");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "sv09",
        totalCards: 190,
        catalogSetIds: ["sv09", "tcgcsv_300"],
      }),
      expect.objectContaining({
        id: "tcgcsv_24461",
        name: "Mega Evolution Energies",
        totalCards: 16,
        releaseDate: null,
        seriesName: null,
        catalogSetIds: ["tcgcsv_24461"],
      }),
    ]));
    expect(response.body.some((set: { id: string }) => set.id === "tcgcsv_2374")).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/3/2374/products"))).toBe(false);

    const detail = await request(app).get("/pokemon/sets/tcgcsv_24461");
    expect(detail.status).toBe(200);
    expect(detail.body.totalCards).toBe(16);
    expect(detail.body.cards).toHaveLength(16);
    expect(detail.body.cards[0]).toMatchObject({
      id: "tcgcsv_24461_7000",
      localId: "1",
      catalogIds: ["tcgcsv_24461_7000"],
    });
  });

  it("merges same-number/name product aliases into canonical TCGdex cards", async () => {
    const groups = [mee, {
      groupId: 300,
      categoryId: 3,
      name: "SET: Journey Together",
      abbreviation: "SET",
    }];
    const products = [{
      productId: 301,
      groupId: 300,
      categoryId: 3,
      name: "Pikachu - 001",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/301_200w.jpg",
      imageCount: 1,
      extendedData: [
        { name: "Number", value: "001" },
        { name: "Card Type", value: "Pokemon" },
        { name: "Rarity", value: "Common" },
      ],
    }];
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net") {
        if (url.pathname.endsWith("/sets/sv09")) {
          return json({
            id: "sv09",
            name: "Journey Together",
            cardCount: { official: 1 },
            cards: [{
              id: "sv09-001",
              localId: "001",
              name: "Pikachu",
              image: "https://assets.tcgdex.net/en/sv/sv09/001",
            }],
          });
        }
        if (url.pathname.endsWith("/cards/sv09-001")) return json({ rarity: "Common" });
      }
      if (url.pathname.endsWith("/groups")) return json(tcgcsvEnvelope(groups));
      if (url.pathname.endsWith("/products")) {
        const groupId = Number(url.pathname.split("/")[3]);
        return json(tcgcsvEnvelope(groupId === 300 ? products : []));
      }
      return json({ success: false, errors: [], results: [] }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(await mountRouter()).get("/pokemon/sets/sv09");
    expect(response.status).toBe(200);
    expect(response.body.totalCards).toBe(1);
    expect(response.body.cards).toEqual([expect.objectContaining({
      id: "sv09-001",
      localId: "001",
      name: "Pikachu",
      rarity: "Common",
      catalogIds: ["sv09-001", "tcgcsv_300_301"],
    })]);
    expect(response.body.catalogSetIds).toEqual(["sv09", "tcgcsv_300"]);
  });

  it("matches live ME03 printed-code and fraction-number catalog entries to TCGdex", async () => {
    const energyKinds = ["Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal"];
    const meeProducts = Array.from({ length: 16 }, (_, index) =>
      energyProduct(7100 + index, index + 1, energyKinds[index % energyKinds.length]!),
    );
    const meeDexCards = [
      "Grass", "Fire", "Water", "Lightning", "Psychic", "Fighting", "Darkness", "Metal",
    ].map((kind, index) => ({
      id: `mee-${String(index + 1).padStart(3, "0")}`,
      localId: String(index + 1).padStart(3, "0"),
      name: `${kind} Energy`,
    }));
    const groups = [mee, {
      groupId: 24587,
      categoryId: 3,
      name: "ME03: Perfect Order",
      abbreviation: "POR",
    }];
    const spinarak = {
      productId: 684397,
      groupId: 24587,
      categoryId: 3,
      name: "Spinarak",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/684397_200w.jpg",
      imageCount: 1,
      extendedData: [
        { name: "Number", displayName: "Card Number", value: "001/088" },
        { name: "Rarity", displayName: "Rarity", value: "Common" },
        { name: "Card Type", displayName: "Card Type", value: "Grass" },
        { name: "HP", displayName: "HP", value: "60" },
        { name: "Stage", displayName: "Stage", value: "Basic" },
      ],
    };
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net") {
        if (url.pathname.endsWith("/sets")) {
          return json([
            { id: "mee", name: "Mega Evolution Energy", cardCount: { official: 8, total: 8 } },
            { id: "me03", name: "Perfect Order", cardCount: { official: 88, total: 124 } },
          ]);
        }
        if (url.pathname.endsWith("/sets/mee")) {
          return json({
            id: "mee",
            name: "Mega Evolution Energy",
            cardCount: { official: 8, total: 8 },
            cards: meeDexCards,
          });
        }
        if (url.pathname.endsWith("/sets/me03")) {
          return json({
            id: "me03",
            name: "Perfect Order",
            cardCount: { official: 88, total: 124 },
            cards: [{
              id: "me03-001",
              localId: "001",
              name: "Spinarak",
              image: "https://assets.tcgdex.net/en/me/me03/001",
            }],
          });
        }
        if (url.pathname.includes("/cards/")) return json({ rarity: "Common" });
      }
      if (url.pathname.endsWith("/groups")) return json(tcgcsvEnvelope(groups));
      if (url.pathname.endsWith("/products")) {
        const groupId = Number(url.pathname.split("/")[3]);
        return json(tcgcsvEnvelope(groupId === 24587 ? [spinarak] : groupId === 24461 ? meeProducts : []));
      }
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = await mountRouter();
    const index = await request(app).get("/pokemon/sets");
    expect(index.status).toBe(200);
    expect(index.body.find((set: { id: string }) => set.id === "me03").catalogSetIds)
      .toEqual(["me03", "tcgcsv_24587"]);
    expect(index.body.find((set: { id: string }) => set.id === "mee")).toMatchObject({
      totalCards: 16,
      catalogSetIds: ["mee", "tcgcsv_24461"],
    });

    const detail = await request(app).get("/pokemon/sets/me03");
    expect(detail.status).toBe(200);
    expect(detail.body.totalCards).toBe(1);
    expect(detail.body.catalogSetIds).toEqual(["me03", "tcgcsv_24587"]);
    expect(detail.body.cards).toEqual([expect.objectContaining({
      id: "me03-001",
      localId: "001",
      name: "Spinarak",
      catalogIds: ["me03-001", "tcgcsv_24587_684397"],
    })]);
    const providerNamespaceDetail = await request(app).get("/pokemon/sets/tcgcsv_24587");
    expect(providerNamespaceDetail.status).toBe(200);
    expect(providerNamespaceDetail.body.id).toBe("me03");
    expect(providerNamespaceDetail.body.catalogSetIds).toEqual(["me03", "tcgcsv_24587"]);
    expect(providerNamespaceDetail.body.cards[0].catalogIds).toEqual([
      "me03-001",
      "tcgcsv_24587_684397",
    ]);

    const meeDetail = await request(app).get("/pokemon/sets/mee");
    expect(meeDetail.status).toBe(200);
    expect(meeDetail.body.totalCards).toBe(16);
    expect(meeDetail.body.catalogSetIds).toEqual(["mee", "tcgcsv_24461"]);
    expect(meeDetail.body.cards.filter((card: { catalogIds: string[] }) => card.catalogIds.length > 1))
      .toHaveLength(8);
    expect(meeDetail.body.cards.find((card: { id: string }) => card.id === "mee-001").catalogIds)
      .toEqual(["mee-001", "tcgcsv_24461_7100"]);
    const meeProviderNamespaceDetail = await request(app).get("/pokemon/sets/tcgcsv_24461");
    expect(meeProviderNamespaceDetail.status).toBe(200);
    expect(meeProviderNamespaceDetail.body.id).toBe("mee");
    expect(meeProviderNamespaceDetail.body.totalCards).toBe(16);
  });

  it("retains TCGdex detail with an explicit warning when TCGCSV is unavailable", async () => {
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net" && url.pathname.endsWith("/sets/sv09")) {
        return json({
          id: "sv09",
          name: "Journey Together",
          cardCount: { official: 1 },
          cards: [{ id: "sv09-001", localId: "001", name: "Pikachu" }],
        });
      }
      if (url.hostname === "api.tcgdex.net" && url.pathname.endsWith("/cards/sv09-001")) {
        return json({ rarity: "Common" });
      }
      if (url.hostname === "api.tcgdex.net" && url.pathname.endsWith("/sets")) {
        return json([{ id: "sv09", name: "Journey Together", cardCount: { official: 1 } }]);
      }
      if (url.pathname.endsWith("/groups")) return json({}, 503);
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = await mountRouter();
    const detail = await request(app).get("/pokemon/sets/sv09");
    expect(detail.status).toBe(200);
    expect(detail.body.catalogWarning).toMatch(/temporarily unavailable/i);
    expect(detail.body.cards).toHaveLength(1);
    expect(detail.body.cards[0].catalogIds).toEqual(["sv09-001"]);

    const index = await request(app).get("/pokemon/sets");
    expect(index.status).toBe(502);
    expect(index.body.error).toMatch(/verify the TCGCSV/i);
  });

  it("keeps the native index cold-cheap and learns exact noncurated totals from detail", async () => {
    const group = {
      groupId: 300,
      categoryId: 3,
      name: "JT: Journey Together",
      abbreviation: "JT",
    };
    const cardProduct = (productId: number, name: string, number: string) => ({
      productId,
      groupId: 300,
      categoryId: 3,
      name,
      imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`,
      imageCount: 1,
      extendedData: [
        { name: "Number", value: number },
        { name: "Card Type", value: "Grass" },
        { name: "HP", value: "60" },
        { name: "Stage", value: "Basic" },
      ],
    });
    const products = [
      cardProduct(301, "Pikachu", "001"),
      cardProduct(302, "Raichu", "002"),
    ];
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net") {
        if (url.pathname.endsWith("/sets")) {
          return json([{ id: "sv09", name: "Journey Together", cardCount: { total: 1 } }]);
        }
        if (url.pathname.endsWith("/sets/sv09")) {
          return json({
            id: "sv09",
            name: "Journey Together",
            cardCount: { total: 1 },
            cards: [{
              id: "sv09-001",
              localId: "001",
              name: "Pikachu",
            }],
          });
        }
        if (url.pathname.endsWith("/cards/sv09-001")) return json({ rarity: "Common" });
      }
      if (url.pathname.endsWith("/groups")) return json(tcgcsvEnvelope([group]));
      if (url.pathname.endsWith("/products")) return json(tcgcsvEnvelope(products));
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = await mountRouter();

    const initialIndex = await request(app).get("/pokemon/sets");
    expect(initialIndex.status).toBe(200);
    expect(initialIndex.body[0].totalCards).toBe(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/3/300/products"))).toBe(false);

    const detail = await request(app).get("/pokemon/sets/sv09");
    expect(detail.body.totalCards).toBe(2);
    expect(detail.body.cards.map((card: { id: string }) => card.id)).toEqual([
      "sv09-001",
      "tcgcsv_300_302",
    ]);

    const learnedIndex = await request(app).get("/pokemon/sets");
    expect(learnedIndex.body[0].totalCards).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/3/300/products"))).toHaveLength(1);
  });

  it("does not return a source-only set detail until its group has verified numbered cards", async () => {
    const unrelatedGroup = {
      groupId: 305,
      categoryId: 3,
      name: "Miscellaneous Cards & Products",
      abbreviation: "MCAP",
    };
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.hostname === "api.tcgdex.net" && url.pathname.endsWith("/sets")) {
        return json([]);
      }
      if (url.pathname.endsWith("/groups")) return json(tcgcsvEnvelope([mee, unrelatedGroup]));
      if (url.pathname.endsWith("/products")) return json(tcgcsvEnvelope([]));
      return json({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const app = await mountRouter();
    const response = await request(app).get("/pokemon/sets/tcgcsv_24461");
    expect(response.status).toBe(404);
    expect(response.body.error).toBe("Set not found");
    const unsupported = await request(app).get("/pokemon/sets/tcgcsv_305");
    expect(unsupported.status).toBe(404);
  });
});