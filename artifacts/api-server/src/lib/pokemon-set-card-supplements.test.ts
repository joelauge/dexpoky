import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  groups: [] as Array<{ groupId: number; categoryId: number; name: string; abbreviation: string }>,
  groupCards: [] as Array<{
    id: string; name: string; setName: string; setId: string; cardNumber: string; imageUrl: string; rarity: string | null;
  }>,
  stored: [] as Array<Record<string, unknown>>,
  insertCalls: [] as Array<Record<string, unknown>>,
  exactCsvCard: null as null | {
    id: string; name: string; setName: string; setId: string; cardNumber: string; imageUrl: string; rarity: string | null;
  },
  pwResult: null as null | { ok: false; reason: "NOT_FOUND" },
}));

vi.mock("./tcgcsv.js", () => ({
  getTcgcsvPokemonGroups: vi.fn(async () => mocks.groups),
  getTcgcsvPokemonGroupCards: vi.fn(async () => mocks.groupCards),
  getTcgcsvCard: vi.fn(async () => mocks.exactCsvCard),
}));

vi.mock("./pokewallet.js", () => ({
  pwGetCard: vi.fn(async () => mocks.pwResult ?? { ok: false, reason: "NOT_FOUND" }),
}));

vi.mock("@workspace/db", () => ({
  pool: {
    query: vi.fn(async (query: string, params: unknown[] = []) => {
      if (query.startsWith("SELECT")) {
        return { rows: mocks.stored, rowCount: mocks.stored.length };
      }
      const [setId, catalogCardId, identityKey, localId, name, imageUrl, rarity, sourceId, verifiedAt] = params;
      const duplicate = mocks.stored.some((row) =>
        (row.setId === setId && row.identityKey === identityKey) ||
        (row.setId === setId && row.catalogCardId === catalogCardId),
      );
      if (duplicate) return { rows: [], rowCount: 0 };
      const value = {
        setId, catalogCardId, identityKey, localId, name, imageUrl, rarity, sourceId, verifiedAt,
      };
      mocks.insertCalls.push(value);
      mocks.stored.push(value);
      return { rows: [{ catalogCardId }], rowCount: 1 };
    }),
  },
}));

import {
  ensureSetCatalogCard,
  mergeSetCardSupplements,
} from "./pokemon-set-card-supplements.js";

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

const group = {
  groupId: 24541,
  categoryId: 3,
  name: "ME: Ascended Heroes",
  abbreviation: "ASC",
};

function canonicalCards(includeTarget = false) {
  const cards = [{
    id: "me02.5-101",
    localId: "101",
    name: "Dugtrio",
    image: "https://assets.tcgdex.net/en/me/me02.5/101",
  }];
  if (includeTarget) cards.push({
    id: "me02.5-294",
    localId: "294",
    name: "Pikachu",
    image: "https://assets.tcgdex.net/en/me/me02.5/294",
  });
  return cards;
}

function stubTcgDexSet(includeTarget = false) {
  vi.stubGlobal("fetch", vi.fn(async (rawUrl: string | URL) => {
    const url = new URL(String(rawUrl));
    if (url.pathname.endsWith("/sets")) {
      return json([{ id: "me02.5", name: "Ascended Heroes" }]);
    }
    if (url.pathname.endsWith("/sets/me02.5")) {
      return json({ id: "me02.5", name: "Ascended Heroes", cards: canonicalCards(includeTarget) });
    }
    if (url.pathname.endsWith("/cards/me02.5-294")) {
      return json({
        id: "me02.5-294",
        localId: "294",
        name: "Pikachu",
        image: "https://assets.tcgdex.net/en/me/me02.5/294",
        rarity: "Illustration Rare",
        set: { id: "me02.5", name: "Ascended Heroes" },
      });
    }
    return json({});
  }));
}

beforeEach(() => {
  mocks.groups = [group];
  mocks.groupCards = [];
  mocks.stored = [];
  mocks.insertCalls = [];
  mocks.exactCsvCard = null;
  mocks.pwResult = null;
  vi.stubGlobal("fetch", vi.fn());
});

describe("verified set checklist supplements", () => {
  it("returns unmatched for ambiguous canonical English group mapping", async () => {
    mocks.groups = [group, { ...group, groupId: 24542 }];
    stubTcgDexSet();
    const result = await ensureSetCatalogCard("me02.5-294");
    expect(result.status).toBe("unmatched");
    expect(mocks.insertCalls).toHaveLength(0);
  });

  it("recognizes the existing TCGCSV alias of the canonical Dugtrio and inserts nothing", async () => {
    const alias = {
      id: "tcgcsv_24541_676933",
      name: "Dugtrio - 101",
      setName: "ME: Ascended Heroes",
      setId: "ASC",
      cardNumber: "101",
      imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/676933_200w.jpg",
      rarity: "Uncommon",
    };
    mocks.exactCsvCard = alias;
    mocks.groupCards = [alias];
    vi.stubGlobal("fetch", vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.pathname.endsWith("/sets")) return json([{ id: "me02.5", name: "Ascended Heroes" }]);
      if (url.pathname.endsWith("/sets/me02.5")) {
        return json({ id: "me02.5", name: "Ascended Heroes", cards: canonicalCards() });
      }
      return json({});
    }));
    const result = await ensureSetCatalogCard(alias.id);
    expect(result).toMatchObject({ status: "already_present", setId: "me02.5", cardId: "me02.5-101" });
    expect(mocks.insertCalls).toHaveLength(0);
    expect(mocks.stored).toHaveLength(0);
  });

  it("adds a genuinely absent exact TCGdex card once and makes it visible in overlay", async () => {
    stubTcgDexSet();
    const first = await ensureSetCatalogCard("me02.5-294");
    const second = await ensureSetCatalogCard("me02.5-294");
    expect(first).toMatchObject({ status: "added", setId: "me02.5", cardId: "me02.5-294" });
    expect(second).toMatchObject({ status: "already_present", cardId: "me02.5-294" });
    expect(mocks.insertCalls).toHaveLength(1);
    expect(mocks.insertCalls[0]).toMatchObject({
      catalogCardId: "me02.5-294",
      localId: "294",
      name: "Pikachu",
      rarity: "Illustration Rare",
      sourceId: "me02.5-294",
    });
    const visible = mergeSetCardSupplements([], mocks.stored as never);
    expect(visible).toEqual([expect.objectContaining({
      id: "me02.5-294",
      localId: "294",
      name: "Pikachu",
      catalogIds: ["me02.5-294"],
    })]);
    expect(mocks.insertCalls.every((row) => !("ownerClerkId" in row))).toBe(true);
  });

  it("rejects an unresolved opaque provider ID without guessing or inserting", async () => {
    const result = await ensureSetCatalogCard("opaque-pw-id");
    expect(result).toMatchObject({ status: "unmatched" });
    expect(result.message).toMatch(/exact provider ID/i);
    expect(mocks.insertCalls).toHaveLength(0);
  });
});