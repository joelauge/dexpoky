import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import sharp from "sharp";

/* ── Hoisted mocks (must be declared before vi.mock calls) ─────────────── */

const mockLimit = vi.hoisted(() => vi.fn());
const mockDnsLookup = vi.hoisted(() =>
  vi.fn().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]),
);

/* ── @workspace/db mock ─────────────────────────────────────────────────── */

vi.mock("@workspace/db", () => {
  const chain: Record<string, unknown> = {};
  chain["select"] = () => chain;
  chain["from"] = () => chain;
  chain["where"] = () => chain;
  chain["leftJoin"] = () => chain;
  chain["limit"] = mockLimit;

  return {
    db: chain,
    wantedListingsTable: { shortCode: "shortCode", id: "id" },
    listingsTable: { id: "id", cardId: "cardId" },
    cardsTable: { id: "id", categoryId: "categoryId" },
    shortLinksTable: { code: "code" },
    categoriesTable: { id: "id", color: "color" },
    eq: (_a: unknown, _b: unknown) => true,
  };
});

/* ── node:dns/promises mock ─────────────────────────────────────────────── */

vi.mock("node:dns/promises", () => ({
  default: { lookup: mockDnsLookup },
  lookup: mockDnsLookup,
}));

/* ── Import OG router AFTER mocks are in place ──────────────────────────── */

import ogRouter from "./og.js";

/* ── Minimal test app ───────────────────────────────────────────────────── */

const app = express();
app.use("/api", ogRouter);

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Create a tiny valid PNG buffer using sharp (used as a fake upstream image). */
async function makePngBuffer(width = 20, height = 28): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

/** Build a minimal fetch Response that returns an image/png payload. */
function makeFetchResponse(body: Buffer): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-length": String(body.byteLength),
    },
  });
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  /api/og/img                                                             */
/* ════════════════════════════════════════════════════════════════════════ */

describe("GET /api/og/img", () => {
  const PUBLIC_IMAGE_URL = "https://example.com/card.png";

  beforeEach(() => {
    vi.restoreAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("returns 400 when url param is missing", async () => {
    const res = await request(app).get("/api/og/img");
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/missing url/i);
  });

  it("returns 400 for a non-http(s) URL", async () => {
    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent("ftp://example.com/img.png")}`,
    );
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/invalid or disallowed/i);
  });

  it("allows localhost URLs (treated as same-origin passthrough, not SSRF blocked)", async () => {
    // localhost is intentionally allowed — the route rewrites it to
    // http://localhost:PORT/... for same-origin image serving. The fetch will
    // fail (nothing listening on that path in tests), so we expect 502, not 400.
    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent("http://localhost/image.png")}`,
    );
    expect(res.status).toBe(502);
  });

  it("returns 400 for a .local domain (SSRF guard)", async () => {
    // .local hostnames go through assertSafeImageUrl and are blocked by hostname check
    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent("http://internal.corp.local/image.png")}`,
    );
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/invalid or disallowed/i);
  });

  it("returns 400 when DNS resolves to a private IP (SSRF guard)", async () => {
    mockDnsLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);
    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent(PUBLIC_IMAGE_URL)}`,
    );
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/invalid or disallowed/i);
  });

  it("returns a valid PNG with correct dimensions for a safe image URL", async () => {
    const srcBuf = await makePngBuffer(20, 28);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(makeFetchResponse(srcBuf));

    const res = await request(app)
      .get(`/api/og/img?url=${encodeURIComponent(PUBLIC_IMAGE_URL)}&color=%23A855F7`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(fetchSpy).toHaveBeenCalledOnce();

    // Verify the response is a valid PNG by parsing it with sharp
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.format).toBe("png");
    // Dimensions must be at least as large as the original (border is additive)
    expect(meta.width).toBeGreaterThanOrEqual(20);
    expect(meta.height).toBeGreaterThanOrEqual(28);
  });

  it("applies a 5% border: output canvas matches source dimensions, inner image is smaller", async () => {
    const srcBuf = await makePngBuffer(100, 140);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeFetchResponse(srcBuf));

    const res = await request(app)
      .get(`/api/og/img?url=${encodeURIComponent(PUBLIC_IMAGE_URL)}&color=%23FFD700`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    const meta = await sharp(res.body as Buffer).metadata();
    // The canvas is created at the original source dimensions (100×140).
    // The inner image is shrunk by 5% on each side and composited on top.
    // So the output PNG dimensions match the source exactly.
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(140);
  });

  it("returns 400 when upstream returns non-image content-type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not an image", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent(PUBLIC_IMAGE_URL)}`,
    );
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/did not return an image/i);
  });

  it("falls back to default accent color when color param is invalid", async () => {
    const srcBuf = await makePngBuffer(20, 28);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(makeFetchResponse(srcBuf));

    // Should not crash with an invalid color — falls back to #C0C0C0
    const res = await request(app).get(
      `/api/og/img?url=${encodeURIComponent(PUBLIC_IMAGE_URL)}&color=notacolor`,
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  /api/og/w/:code — Wanted listing share page                            */
/* ════════════════════════════════════════════════════════════════════════ */

describe("GET /api/og/w/:code", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("returns HTML with correct og:title and og:image for a known wanted listing", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 1,
        shortCode: "abc123",
        name: "Charizard",
        setName: "Base Set",
        rarity: "holo_rare",
        maxPrice: "50.00",
        imageUrl: "https://example.com/charizard.png",
      },
    ]);

    const res = await request(app).get("/api/og/w/abc123");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);

    const html = res.text;
    // buildHtml only escapes & and " — apostrophe is kept raw in attribute values
    expect(html).toContain(`content="I'm looking for Charizard on DexPoky.com"`);
    // og:image should point to the /api/og/img endpoint
    expect(html).toContain("/api/og/img?url=");
    // Accent for holo_rare is #A855F7
    expect(html).toContain("#A855F7");
    // Must include a redirect to /w/abc123
    expect(html).toContain("/w/abc123");
  });

  it("includes set name and budget in the description", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 2,
        shortCode: "xyz",
        name: "Mewtwo",
        setName: "Fossil",
        rarity: "rare",
        maxPrice: "20.00",
        imageUrl: null,
      },
    ]);

    const res = await request(app).get("/api/og/w/xyz");

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain("Fossil");
    expect(html).toContain("Budget: $20.00");
  });

  it("redirects when wanted listing code is not found", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/og/w/notfound");

    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/w/notfound");
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  /api/og/listing/:id — Marketplace listing share page                   */
/* ════════════════════════════════════════════════════════════════════════ */

describe("GET /api/og/listing/:id", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("returns HTML with correct og:title and accent color for a known listing", async () => {
    // First call: listing + card join
    mockLimit.mockResolvedValueOnce([
      {
        id: 42,
        price: "15.99",
        description: "Mint condition",
        listingImages: [],
        listingType: "fixed",
        cardName: "Blastoise",
        cardImage: "https://example.com/blastoise.png",
        setName: "Base Set",
        rarity: "ultra_rare",
        categoryId: null,
      },
    ]);

    const res = await request(app).get("/api/og/listing/42");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);

    const html = res.text;
    expect(html).toContain("selling Blastoise on DexPoky.com");
    // ultra_rare accent is #FFD700
    expect(html).toContain("#FFD700");
    expect(html).toContain("$15.99");
    expect(html).toContain("/view/listing/42");
  });

  it("labels auction listings correctly", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 7,
        price: "5.00",
        description: null,
        listingImages: [],
        listingType: "auction",
        cardName: "Pikachu",
        cardImage: null,
        setName: null,
        rarity: "common",
        categoryId: null,
      },
    ]);

    const res = await request(app).get("/api/og/listing/7");

    expect(res.status).toBe(200);
    expect(res.text).toContain("auctioning Pikachu on DexPoky.com");
    expect(res.text).toContain("Starting at $5.00");
  });

  it("uses category color when available (higher priority than rarity)", async () => {
    // Listing row
    mockLimit.mockResolvedValueOnce([
      {
        id: 99,
        price: "30.00",
        description: null,
        listingImages: [],
        listingType: "fixed",
        cardName: "Gengar",
        cardImage: "https://example.com/gengar.png",
        setName: null,
        rarity: "holo_rare",
        categoryId: 5,
      },
    ]);
    // Category row
    mockLimit.mockResolvedValueOnce([{ color: "#FF00FF" }]);

    const res = await request(app).get("/api/og/listing/99");

    expect(res.status).toBe(200);
    // Category color should override rarity color
    expect(res.text).toContain("#FF00FF");
    expect(res.text).not.toContain("#A855F7"); // holo_rare color should NOT appear
  });

  it("redirects when listing id is non-numeric", async () => {
    const res = await request(app).get("/api/og/listing/abc");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/view/listing/abc");
  });

  it("redirects when listing is not found in the database", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/og/listing/9999");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/view/listing/9999");
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  /api/og/card/:id — Card share page                                     */
/* ════════════════════════════════════════════════════════════════════════ */

describe("GET /api/og/card/:id", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("returns HTML with correct og metadata for a known card", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 3,
        name: "Venusaur",
        imageUrl: "https://example.com/venusaur.png",
        setName: "Base Set",
        cardNumber: "15",
        rarity: "rare",
        condition: "Near Mint",
        categoryId: null,
      },
    ]);

    const res = await request(app).get("/api/og/card/3");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);

    const html = res.text;
    expect(html).toContain("Check this out on my DexPoky.com account.");
    expect(html).toContain("Base Set");
    expect(html).toContain("#15");
    expect(html).toContain("rare");
    expect(html).toContain("Near Mint");
    expect(html).toContain("/view/card/3");
    // rare accent is #3B82F6
    expect(html).toContain("#3B82F6");
  });

  it("returns HTML with correct og metadata when card has a category color", async () => {
    mockLimit.mockResolvedValueOnce([
      {
        id: 10,
        name: "Alakazam",
        imageUrl: "https://example.com/alakazam.png",
        setName: "Jungle",
        cardNumber: "1",
        rarity: "holo_rare",
        condition: null,
        categoryId: 3,
      },
    ]);
    mockLimit.mockResolvedValueOnce([{ color: "#00BFFF" }]);

    const res = await request(app).get("/api/og/card/10");

    expect(res.status).toBe(200);
    expect(res.text).toContain("#00BFFF");
  });

  it("redirects when card id is non-numeric", async () => {
    const res = await request(app).get("/api/og/card/bad-id");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/view/card/bad-id");
  });

  it("redirects when card is not found in the database", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/og/card/8888");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/view/card/8888");
  });
});

/* ════════════════════════════════════════════════════════════════════════ */
/*  /api/og/s/:code — Generic short link resolver                          */
/* ════════════════════════════════════════════════════════════════════════ */

describe("GET /api/og/s/:code", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockDnsLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });

  it("redirects when short code is not found", async () => {
    mockLimit.mockResolvedValueOnce([]);

    const res = await request(app).get("/api/og/s/UNKNOWN");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/s/UNKNOWN");
  });

  it("renders a listing share page when short link points to a listing URL", async () => {
    // Short link row
    mockLimit.mockResolvedValueOnce([
      { code: "LNK1", targetUrl: "/view/listing/55" },
    ]);
    // Listing + card join
    mockLimit.mockResolvedValueOnce([
      {
        id: 55,
        price: "9.99",
        listingType: "fixed",
        listingImages: [],
        cardName: "Electrode",
        cardImage: "https://example.com/electrode.png",
        setName: "Jungle",
        rarity: "uncommon",
        categoryId: null,
      },
    ]);

    const res = await request(app).get("/api/og/s/LNK1");

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain("selling Electrode on DexPoky.com");
    expect(html).toContain("/view/listing/55");
  });

  it("renders a wanted listing share page when short link points to a /w/ URL", async () => {
    // Short link row
    mockLimit.mockResolvedValueOnce([
      { code: "WNTD", targetUrl: "/w/pikaWanted" },
    ]);
    // Wanted listing row
    mockLimit.mockResolvedValueOnce([
      {
        id: 5,
        shortCode: "pikaWanted",
        name: "Pikachu VMAX",
        setName: "Sword & Shield",
        rarity: "ultra_rare",
        maxPrice: "100.00",
        imageUrl: null,
      },
    ]);

    const res = await request(app).get("/api/og/s/WNTD");

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain("looking for Pikachu VMAX on DexPoky.com");
    expect(html).toContain("/w/pikaWanted");
  });

  it("renders a card share page when short link points to a /view/card/ URL", async () => {
    // Short link row
    mockLimit.mockResolvedValueOnce([
      { code: "CARD1", targetUrl: "/view/card/77" },
    ]);
    // Card row
    mockLimit.mockResolvedValueOnce([
      {
        name: "Snorlax",
        imageUrl: null,
        setName: "Base Set 2",
        cardNumber: "11",
        rarity: "common",
        condition: null,
        categoryId: null,
      },
    ]);

    const res = await request(app).get("/api/og/s/CARD1");

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain("Check this out on my DexPoky.com account.");
    // Description contains set name and card number (card name is not in the title or description)
    expect(html).toContain("Base Set 2");
    expect(html).toContain("#11");
    expect(html).toContain("/view/card/77");
  });

  it("renders a generic collection share page when short link doesn't match listing/card/wanted patterns", async () => {
    // Short link that points to a generic URL
    mockLimit.mockResolvedValueOnce([
      { code: "GEN1", targetUrl: "/my-collection" },
    ]);

    const res = await request(app).get("/api/og/s/GEN1");

    expect(res.status).toBe(200);
    const html = res.text;
    expect(html).toContain("sharing my collection on DexPoky.com");
  });
});
