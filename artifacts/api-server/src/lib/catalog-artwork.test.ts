import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic identity fixtures, not assertions that these printings exist upstream.
const sets = [
  { id: "sv3", name: "Obsidian Flames" },
  { id: "mee", name: "Mega Evolution Energy" },
  { id: "xyp", name: "XY Promos" },
];
const fire = {
  name: "Fire Energy", setName: "Obsidian Flames", setCode: "OBF", cardNumber: "005/230",
};

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: "sv3-5", localId: "5", name: "Fire Energy", set: sets[0],
    image: "https://assets.tcgdex.net/en/sv/sv3/5",
    ...overrides,
  };
}

let lookup: typeof import("./catalog-artwork.js").lookupVerifiedCatalogImage;
let fetchMock: ReturnType<typeof vi.fn>;
let cardDetail: unknown;
let setList: unknown;

beforeEach(async () => {
  vi.resetModules();
  cardDetail = detail();
  setList = sets;
  fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(
    url.endsWith("/sets") ? setList : cardDetail,
  ), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  lookup = (await import("./catalog-artwork.js")).lookupVerifiedCatalogImage;
});

afterEach(() => vi.unstubAllGlobals());

describe("verified printing artwork", () => {
  it("accepts explicit exact-set artwork and numeric padding without changing collector tags", async () => {
    expect(await lookup(fire)).toBe("https://assets.tcgdex.net/en/sv/sv3/5/high.webp");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/sv3-005"), expect.anything(),
    );
    cardDetail = detail({
      id: "xyp-XY95", localId: "XY95", name: "Pikachu", set: sets[2],
      image: "https://assets.tcgdex.net/en/xy/xyp/XY95",
    });
    expect(await lookup({
      name: "Pikachu", setCode: "XYP", setName: "XY Promos", cardNumber: "XY95",
    })).toBe("https://assets.tcgdex.net/en/xy/xyp/XY95/high.webp");
  });

  it.each([
    ["different set ID", { id: "mee-5" }],
    ["different detail set", { set: sets[1] }],
    ["different collector", { localId: "6" }],
    ["different name", { name: "Psychic Energy" }],
    ["missing set", { set: undefined }],
    ["missing collector", { localId: undefined }],
    ["missing image", { image: undefined }],
    ["null image", { image: null }],
    ["cross-set image", { image: "https://assets.tcgdex.net/en/me/mee/5" }],
    ["cross-number image", { image: "https://assets.tcgdex.net/en/sv/sv3/6" }],
    ["unknown image host", { image: "https://example.invalid/en/sv/sv3/5" }],
    ["tagged number is not numeric", { localId: "5a" }],
  ])("leaves artwork unavailable for %s", async (_label, overrides) => {
    cardDetail = detail(overrides);
    expect(await lookup(fire)).toBeNull();
  });

  it("never shares same-name/number cached artwork across sets", async () => {
    expect(await lookup(fire)).toContain("/sv3/5/");
    // Even a misbehaving endpoint returning the earlier printing is rejected.
    expect(await lookup({
      ...fire, setCode: "MEE", setName: "Mega Evolution Energy",
    })).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/cards/mee-005"), expect.anything(),
    );
  });

  it("rejects missing, ambiguous, or contradictory set evidence without broad name searches", async () => {
    expect(await lookup({ ...fire, setName: "", setCode: "" })).toBeNull();
    expect(await lookup({ ...fire, setName: "Unlisted Anniversary", setCode: "ANN" })).toBeNull();
    expect(await lookup({ ...fire, setCode: "MEE" })).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/sets"))).toBe(true);
  });

  it("does not resolve ambiguous set names", async () => {
    setList = [...sets, { id: "other", name: "Obsidian Flames" }];
    expect(await lookup(fire)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces repeated exact identities but retries transient lookup failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("temporary network failure"));
    expect(await lookup(fire)).toBeNull();
    const results = await Promise.all([lookup(fire), lookup(fire)]);
    expect(results).toEqual([
      "https://assets.tcgdex.net/en/sv/sv3/5/high.webp",
      "https://assets.tcgdex.net/en/sv/sv3/5/high.webp",
    ]);
    const count = fetchMock.mock.calls.length;
    expect(await lookup(fire)).toBe(results[0]);
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
});