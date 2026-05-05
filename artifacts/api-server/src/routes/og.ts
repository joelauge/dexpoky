import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { wantedListingsTable, listingsTable, cardsTable, shortLinksTable, categoriesTable, groupSharesTable, groupShareCardsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import dns from "node:dns/promises";

const router = Router();

/* ── Rarity → accent color ─────────────────────────────────────────────── */

const RARITY_COLORS: Record<string, string> = {
  secret_rare: "#FFD700",
  ultra_rare: "#FFD700",
  holo_rare: "#A855F7",
  rare: "#3B82F6",
  uncommon: "#C0C0C0",
  common: "#C0C0C0",
  promo: "#F97316",
};

const DEFAULT_ACCENT = "#C0C0C0";

/**
 * Returns the accent hex color for a card.
 * categoryColor (if present) takes highest priority, then rarity.
 */
function accentForCard(rarity: string | null | undefined, categoryColor: string | null | undefined): string {
  if (categoryColor && /^#[0-9A-Fa-f]{3,8}$/.test(categoryColor)) return categoryColor;
  if (rarity) {
    const normalized = rarity.toLowerCase().replace(/[\s-]/g, "_");
    return RARITY_COLORS[normalized] ?? DEFAULT_ACCENT;
  }
  return DEFAULT_ACCENT;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function getOrigin(req: Request): string {
  if (req.headers["x-forwarded-host"]) {
    return `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`;
  }
  // Replit's proxy may not forward x-forwarded-host in dev; use the public domain.
  const replitDomain = process.env.REPLIT_DOMAINS ?? process.env.REPLIT_DEV_DOMAIN;
  if (replitDomain) {
    return `https://${replitDomain.split(",")[0].trim()}`;
  }
  return `${req.protocol}://${req.get("host")}`;
}

function cleanDomain(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
}

/**
 * Normalize a stored image path to a routable URL path.
 * Stored object-storage paths come in as "/objects/..." — they need the "/api/storage" prefix.
 * External URLs (http/https) and already-prefixed API paths are returned unchanged.
 */
function normalizeImagePath(path: string): string {
  if (!path) return path;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/api/")) return path;
  return `/api/storage${path}`;
}

/** Build an /api/og/img URL with the card image + accent color encoded. */
function borderedImageUrl(origin: string, rawUrl: string, color: string): string {
  const normalized = normalizeImagePath(rawUrl);
  // Relative paths must be made absolute for external crawlers.
  const absUrl = normalized.startsWith("/") ? `${origin}${normalized}` : normalized;
  return `${origin}/api/og/img?url=${encodeURIComponent(absUrl)}&color=${encodeURIComponent(color)}`;
}

/* ── buildHtml ─────────────────────────────────────────────────────────────*/

function buildHtml(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  cardAspect?: boolean;
  redirectUrl: string;
  origin: string;
  siteName?: string;
  accentColor?: string;
}): string {
  const { title, description, imageUrl, cardAspect, redirectUrl, origin, siteName = "DexPoky", accentColor } = opts;
  const absRedirect = redirectUrl.startsWith("http") ? redirectUrl : `${origin}${redirectUrl}`;
  const image = imageUrl ?? `${origin}/logo.png`;
  const t = title.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const d = description.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const imgW = cardAspect ? "734" : "1200";
  const imgH = cardAspect ? "1024" : "630";
  const accent = accentColor ?? DEFAULT_ACCENT;

  const borderRadius = cardAspect ? "10px" : "16px";
  const maxW = cardAspect ? "120px" : "160px";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t}</title>

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:url" content="${absRedirect}">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="${imgW}">
  <meta property="og:image:height" content="${imgH}">
  <meta property="og:image:alt" content="${t}">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:site" content="@dexpoky">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${image}">

  <!-- Delayed redirect — gives humans a moment to see the card -->
  <meta http-equiv="refresh" content="3;url=${absRedirect}">
</head>
<body style="margin:0;background:#0a0a0f;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box">
  <div style="text-align:center;max-width:380px;width:100%;padding:36px 32px;background:#141420;border-radius:24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 64px rgba(0,0,0,.7)">
    <div id="card-wrap" style="display:inline-block;perspective:600px;margin-bottom:24px">
      <img
        id="og-card"
        src="${image}"
        alt=""
        style="max-width:${maxW};border-radius:${borderRadius};display:block;will-change:transform;transition:transform 0.15s ease-out;box-shadow:0 0 0 3px ${accent},0 0 18px 4px ${accent}66,0 12px 40px rgba(0,0,0,.6);cursor:pointer"
      >
    </div>
    <p style="font-size:18px;font-weight:700;margin:0 0 10px;line-height:1.35;letter-spacing:-0.2px">${t}</p>
    <p style="font-size:13px;color:#8888aa;margin:0 0 20px;line-height:1.6">${d}</p>
    <p style="font-size:11px;color:#44445a;letter-spacing:0.5px">Redirecting&hellip;</p>
  </div>

  <script>
  (function() {
    var card = document.getElementById('og-card');
    var wrap = document.getElementById('card-wrap');
    if (!card || !wrap) return;

    var MAX_TILT = 15;
    var reset = 'rotateX(0deg) rotateY(0deg)';

    function applyTilt(rx, ry) {
      card.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    }

    wrap.addEventListener('pointermove', function(e) {
      var r = wrap.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      applyTilt(-y * MAX_TILT * 2, x * MAX_TILT * 2);
    });

    wrap.addEventListener('pointerleave', function() {
      card.style.transition = 'transform 0.4s ease-out';
      card.style.transform = reset;
    });

    wrap.addEventListener('pointerenter', function() {
      card.style.transition = 'transform 0.1s ease-out';
    });

    wrap.addEventListener('touchmove', function(e) {
      if (!e.touches[0]) return;
      e.preventDefault();
      var r = wrap.getBoundingClientRect();
      var x = (e.touches[0].clientX - r.left) / r.width - 0.5;
      var y = (e.touches[0].clientY - r.top) / r.height - 0.5;
      card.style.transition = 'transform 0.05s ease-out';
      applyTilt(-y * MAX_TILT * 2, x * MAX_TILT * 2);
    }, { passive: false });

    wrap.addEventListener('touchend', function() {
      card.style.transition = 'transform 0.4s ease-out';
      card.style.transform = reset;
    });

    if (window.DeviceOrientationEvent) {
      var baseBeta = null;
      var baseGamma = null;
      window.addEventListener('deviceorientation', function(e) {
        if (e.beta === null || e.gamma === null) return;
        if (baseBeta === null) { baseBeta = e.beta; baseGamma = e.gamma; return; }
        var dy = Math.max(-MAX_TILT, Math.min(MAX_TILT, (e.beta - baseBeta) * 0.8));
        var dx = Math.max(-MAX_TILT, Math.min(MAX_TILT, (e.gamma - baseGamma) * 0.8));
        card.style.transition = 'transform 0.1s ease-out';
        applyTilt(dy, dx);
      });
    }

    card.addEventListener('click', function() {
      window.location.replace(${JSON.stringify(absRedirect)});
    });

    // Delayed auto-redirect (JS takes over from meta refresh)
    var redirectTimer = setTimeout(function() {
      window.location.replace(${JSON.stringify(absRedirect)});
    }, 3000);

    // Cancel timer if user navigates away (e.g. tapped card)
    window.addEventListener('beforeunload', function() { clearTimeout(redirectTimer); });
  })();
  </script>
</body>
</html>`;
}

/* ── /api/og/img — server-side bordered image ──────────────────────────── */

/** Hex color → {r, g, b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/** Max image payload accepted from upstream (10 MB). */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Return true if the given IPv4 dotted-decimal string is in a private,
 * loopback, link-local, or otherwise non-routable range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a === 198 && b === 51 && parts[2] === 100 ||
    a === 203 && b === 0 && parts[2] === 113 ||
    a >= 224
  );
}

/**
 * Return true if the given IPv6 address string is loopback, link-local,
 * ULA (fc00::/7), or any other non-global-unicast range.
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower === "::" || lower === "0:0:0:0:0:0:0:0" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("ff")) return true;
  // Mapped IPv4 loopback/private via ::ffff:
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Resolve the hostname of `raw` URL via DNS and verify the result is a safe,
 * public address. Blocks:
 *  - non-http(s) schemes
 *  - .local / localhost hostnames
 *  - any hostname that resolves to a private/loopback/link-local IPv4 or IPv6
 *
 * Throws an error with a human-readable message on failure.
 */
async function assertSafeImageUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".local") || host === "::1") {
    throw new Error("Disallowed host");
  }

  // Resolve hostname → all addresses, check every result
  let addresses: Awaited<ReturnType<typeof dns.lookup<true>>>;
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new Error("DNS resolution failed");
  }

  if (!addresses || addresses.length === 0) {
    throw new Error("No DNS records found");
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateIPv4(address)) {
      throw new Error("Disallowed address");
    }
    if (family === 6 && isPrivateIPv6(address)) {
      throw new Error("Disallowed address");
    }
  }

  return parsed;
}

router.get("/og/img", async (req, res) => {
  const { url, color, size } = req.query as Record<string, string>;

  if (!url) {
    res.status(400).send("Missing url");
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    res.status(400).send("Invalid URL");
    return;
  }

  // For same-origin image URLs (our own storage), rewrite to localhost to avoid
  // DNS-based SSRF checks that would block internal Replit addresses.
  const selfOrigin = getOrigin(req);
  let selfHost = "";
  try { selfHost = new URL(selfOrigin).hostname; } catch { /* ignore */ }

  let fetchUrl: string;
  if (parsedUrl.hostname === selfHost || parsedUrl.hostname === "localhost") {
    const port = process.env.PORT ?? "8080";
    fetchUrl = `http://localhost:${port}${parsedUrl.pathname}${parsedUrl.search}`;
  } else {
    try {
      await assertSafeImageUrl(url);
    } catch {
      res.status(400).send("Invalid or disallowed URL");
      return;
    }
    fetchUrl = url;
  }

  const accent = color && /^#[0-9A-Fa-f]{3,8}$/.test(color) ? color : DEFAULT_ACCENT;

  // Optional output size override (max 1200px to avoid abuse)
  const requestedSize = size ? parseInt(size, 10) : null;
  const outputSize = requestedSize && requestedSize > 0 && requestedSize <= 1200 ? requestedSize : null;

  try {
    const resp = await fetch(fetchUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);

    // Validate content-type is an image
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      res.status(400).send("URL did not return an image");
      return;
    }

    // Guard against oversized payloads before buffering
    const contentLength = resp.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_IMAGE_BYTES) {
      res.status(400).send("Image too large");
      return;
    }

    // Stream and cap at MAX_IMAGE_BYTES
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const reader = resp.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_IMAGE_BYTES) {
        await reader.cancel();
        res.status(400).send("Image too large");
        return;
      }
      chunks.push(value);
    }
    const srcBuf = Buffer.concat(chunks.map(c => Buffer.from(c)));

    const meta = await sharp(srcBuf).metadata();
    let w = meta.width ?? 400;
    let h = meta.height ?? 560;

    // If output size requested, scale while preserving aspect ratio
    if (outputSize) {
      const aspect = h / w;
      w = outputSize;
      h = Math.round(outputSize * aspect);
    }

    const bx = Math.round(w * 0.05);
    const by = Math.round(h * 0.05);

    const rgb = hexToRgb(accent);

    const result = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp(srcBuf)
            .resize(w - bx * 2, h - by * 2, { fit: "fill" })
            .toBuffer(),
          top: by,
          left: bx,
        },
      ])
      .png()
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.send(result);
  } catch (err) {
    res.status(502).send("Failed to process image");
  }
});

/* ── "Looking For" wanted listing ──────────────────────────────────────── */
router.get("/og/w/:code", async (req, res) => {
  const { code } = req.params;
  const [row] = await db
    .select()
    .from(wantedListingsTable)
    .where(eq(wantedListingsTable.shortCode, code))
    .limit(1);

  const origin = getOrigin(req);

  if (!row) {
    res.redirect(`/w/${code}`);
    return;
  }

  const name = row.name ?? "a Pokémon Card";
  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/w/${code}`;

  const descParts: string[] = [];
  if (row.setName) descParts.push(row.setName);
  if (row.rarity) descParts.push(row.rarity);
  if (row.maxPrice) descParts.push(`Budget: $${parseFloat(String(row.maxPrice)).toFixed(2)}`);
  descParts.push(shareUrl);

  const accent = accentForCard(row.rarity, null);
  const imageUrl = row.imageUrl ? borderedImageUrl(origin, row.imageUrl, accent) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `I'm looking for ${name} on DexPoky.com`,
      description: descParts.join("  ·  "),
      imageUrl,
      cardAspect: true,
      redirectUrl: `/w/${code}`,
      origin,
      accentColor: accent,
    }),
  );
});

/* ── Marketplace listing ────────────────────────────────────────────────── */
router.get("/og/listing/:id", async (req, res) => {
  const id = Number(req.params.id);
  const origin = getOrigin(req);

  if (isNaN(id)) {
    res.redirect(`/view/listing/${req.params.id}`);
    return;
  }

  const [row] = await db
    .select({
      id: listingsTable.id,
      price: listingsTable.price,
      description: listingsTable.description,
      listingImages: listingsTable.listingImages,
      listingType: listingsTable.listingType,
      cardName: cardsTable.name,
      cardImage: cardsTable.imageUrl,
      setName: cardsTable.setName,
      rarity: cardsTable.rarity,
      categoryId: cardsTable.categoryId,
    })
    .from(listingsTable)
    .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
    .where(eq(listingsTable.id, id))
    .limit(1);

  if (!row) {
    res.redirect(`/view/listing/${id}`);
    return;
  }

  let categoryColor: string | null = null;
  if (row.categoryId) {
    const [cat] = await db
      .select({ color: categoriesTable.color })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, row.categoryId))
      .limit(1);
    categoryColor = cat?.color ?? null;
  }

  const cardName = row.cardName ?? "a Pokémon Card";
  const price = row.price ? `$${parseFloat(String(row.price)).toFixed(2)}` : null;
  const rawImage = Array.isArray(row.listingImages) && row.listingImages.length > 0
    ? row.listingImages[0] as string
    : (row.cardImage ?? null);
  const isAuction = row.listingType === "auction";
  const action = isAuction ? "auctioning" : "selling";
  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/view/listing/${id}`;

  const descParts: string[] = [];
  if (row.setName) descParts.push(row.setName);
  if (price) descParts.push(isAuction ? `Starting at ${price}` : price);
  descParts.push(shareUrl);

  const accent = accentForCard(row.rarity, categoryColor);
  const imageUrl = rawImage ? borderedImageUrl(origin, rawImage, accent) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `I'm ${action} ${cardName} on DexPoky.com`,
      description: descParts.join("  ·  "),
      imageUrl,
      cardAspect: true,
      redirectUrl: `/view/listing/${id}`,
      origin,
      accentColor: accent,
    }),
  );
});

/* ── Card view ───────────────────────────────────────────────────────────── */
router.get("/og/card/:id", async (req, res) => {
  const id = Number(req.params.id);
  const origin = getOrigin(req);

  if (isNaN(id)) {
    res.redirect(`/view/card/${req.params.id}`);
    return;
  }

  const [card] = await db
    .select({
      id: cardsTable.id,
      name: cardsTable.name,
      imageUrl: cardsTable.imageUrl,
      setName: cardsTable.setName,
      cardNumber: cardsTable.cardNumber,
      rarity: cardsTable.rarity,
      condition: cardsTable.condition,
      categoryId: cardsTable.categoryId,
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, id))
    .limit(1);

  if (!card) {
    res.redirect(`/view/card/${id}`);
    return;
  }

  let categoryColor: string | null = null;
  if (card.categoryId) {
    const [cat] = await db
      .select({ color: categoriesTable.color })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, card.categoryId))
      .limit(1);
    categoryColor = cat?.color ?? null;
  }

  const cardName = card.name ?? "a Pokémon Card";
  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/view/card/${id}`;

  const descParts: string[] = [];
  if (card.setName) descParts.push(card.setName);
  if (card.cardNumber) descParts.push(`#${card.cardNumber}`);
  if (card.rarity) descParts.push(card.rarity);
  if (card.condition) descParts.push(card.condition);
  descParts.push(shareUrl);

  const accent = accentForCard(card.rarity, categoryColor);
  const imageUrl = card.imageUrl ? borderedImageUrl(origin, card.imageUrl, accent) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: "Check this out on my DexPoky.com account.",
      description: descParts.join("  ·  "),
      imageUrl,
      cardAspect: true,
      redirectUrl: `/view/card/${id}`,
      origin,
      accentColor: accent,
    }),
  );
});

/* ── Generic short link ─────────────────────────────────────────────────── */
router.get("/og/s/:code", async (req, res) => {
  const { code } = req.params;
  const origin = getOrigin(req);

  const [link] = await db
    .select()
    .from(shortLinksTable)
    .where(eq(shortLinksTable.code, code))
    .limit(1);

  if (!link) {
    res.redirect(`/s/${code}`);
    return;
  }

  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/s/${code}`;

  // Detect listing links
  const listingMatch = link.targetUrl.match(/\/(?:api\/og\/listing|view\/listing)\/(\d+)/);
  if (listingMatch) {
    const listingId = Number(listingMatch[1]);
    const [row] = await db
      .select({
        id: listingsTable.id,
        price: listingsTable.price,
        listingType: listingsTable.listingType,
        listingImages: listingsTable.listingImages,
        cardName: cardsTable.name,
        cardImage: cardsTable.imageUrl,
        setName: cardsTable.setName,
        rarity: cardsTable.rarity,
        categoryId: cardsTable.categoryId,
      })
      .from(listingsTable)
      .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
      .where(eq(listingsTable.id, listingId))
      .limit(1);

    if (row) {
      let categoryColor: string | null = null;
      if (row.categoryId) {
        const [cat] = await db
          .select({ color: categoriesTable.color })
          .from(categoriesTable)
          .where(eq(categoriesTable.id, row.categoryId))
          .limit(1);
        categoryColor = cat?.color ?? null;
      }
      const cardName = row.cardName ?? "a Pokémon Card";
      const price = row.price ? `$${parseFloat(String(row.price)).toFixed(2)}` : null;
      const isAuction = row.listingType === "auction";
      const rawImage = Array.isArray(row.listingImages) && row.listingImages.length > 0
        ? row.listingImages[0] as string
        : (row.cardImage ?? null);
      const descParts: string[] = [];
      if (row.setName) descParts.push(row.setName);
      if (price) descParts.push(isAuction ? `Starting at ${price}` : price);
      descParts.push(shareUrl);
      const accent = accentForCard(row.rarity, categoryColor);
      const imageUrl = rawImage ? borderedImageUrl(origin, rawImage, accent) : null;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        buildHtml({
          title: `I'm ${isAuction ? "auctioning" : "selling"} ${cardName} on DexPoky.com`,
          description: descParts.join("  ·  "),
          imageUrl,
          cardAspect: true,
          redirectUrl: `/view/listing/${listingId}`,
          origin,
          accentColor: accent,
        }),
      );
      return;
    }
  }

  // Detect wanted listing links
  const wantedMatch = link.targetUrl.match(/\/w\/([^/?]+)/);
  if (wantedMatch) {
    const wCode = wantedMatch[1];
    const [wRow] = await db
      .select()
      .from(wantedListingsTable)
      .where(eq(wantedListingsTable.shortCode, wCode))
      .limit(1);

    if (wRow) {
      const name = wRow.name ?? "a Pokémon Card";
      const descParts: string[] = [];
      if (wRow.setName) descParts.push(wRow.setName);
      if (wRow.rarity) descParts.push(wRow.rarity);
      if (wRow.maxPrice) descParts.push(`Budget: $${parseFloat(String(wRow.maxPrice)).toFixed(2)}`);
      descParts.push(shareUrl);
      const accent = accentForCard(wRow.rarity, null);
      const imageUrl = wRow.imageUrl ? borderedImageUrl(origin, wRow.imageUrl, accent) : null;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        buildHtml({
          title: `I'm looking for ${name} on DexPoky.com`,
          description: descParts.join("  ·  "),
          imageUrl,
          cardAspect: true,
          redirectUrl: `/w/${wCode}`,
          origin,
          accentColor: accent,
        }),
      );
      return;
    }
  }

  // Detect card links
  const cardMatch = link.targetUrl.match(/\/(?:api\/og\/card|view\/card)\/(\d+)/);
  if (cardMatch) {
    const cardId = Number(cardMatch[1]);
    const [card] = await db
      .select({
        name: cardsTable.name,
        imageUrl: cardsTable.imageUrl,
        setName: cardsTable.setName,
        cardNumber: cardsTable.cardNumber,
        rarity: cardsTable.rarity,
        condition: cardsTable.condition,
        categoryId: cardsTable.categoryId,
      })
      .from(cardsTable)
      .where(eq(cardsTable.id, cardId))
      .limit(1);

    if (card) {
      let categoryColor: string | null = null;
      if (card.categoryId) {
        const [cat] = await db
          .select({ color: categoriesTable.color })
          .from(categoriesTable)
          .where(eq(categoriesTable.id, card.categoryId))
          .limit(1);
        categoryColor = cat?.color ?? null;
      }

      const descParts: string[] = [];
      if (card.setName) descParts.push(card.setName);
      if (card.cardNumber) descParts.push(`#${card.cardNumber}`);
      if (card.rarity) descParts.push(card.rarity);
      descParts.push(shareUrl);

      const accent = accentForCard(card.rarity, categoryColor);
      const imageUrl = card.imageUrl ? borderedImageUrl(origin, card.imageUrl, accent) : null;

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        buildHtml({
          title: "Check this out on my DexPoky.com account.",
          description: descParts.join("  ·  "),
          imageUrl,
          cardAspect: true,
          redirectUrl: `/view/card/${cardId}`,
          origin,
          accentColor: accent,
        }),
      );
      return;
    }
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: "I'm sharing my collection on DexPoky.com",
      description: `Check out my Pokémon card collection!  ·  ${shareUrl}`,
      imageUrl: null,
      cardAspect: false,
      redirectUrl: link.targetUrl,
      origin,
    }),
  );
});

/* ── Group share OG page ─────────────────────────────────────────────────── */
router.get("/og/g/:code", async (req, res) => {
  const { code } = req.params;
  const origin = getOrigin(req);

  const [groupShare] = await db
    .select()
    .from(groupSharesTable)
    .where(eq(groupSharesTable.code, code))
    .limit(1);

  if (!groupShare) {
    res.redirect(`/view/group/${code}`);
    return;
  }

  const shareCards = await db
    .select({
      images: groupShareCardsTable.images,
      cardId: groupShareCardsTable.cardId,
    })
    .from(groupShareCardsTable)
    .where(eq(groupShareCardsTable.groupShareId, groupShare.id))
    .orderBy(groupShareCardsTable.displayOrder);

  const cardIds = shareCards.map(sc => sc.cardId);
  const cardRows = cardIds.length > 0
    ? await db
        .select({ id: cardsTable.id, name: cardsTable.name, imageUrl: cardsTable.imageUrl, rarity: cardsTable.rarity, categoryId: cardsTable.categoryId })
        .from(cardsTable)
        .where(inArray(cardsTable.id, cardIds))
    : [];
  const cardMap = new Map(cardRows.map(c => [c.id, c]));

  const title = groupShare.title || `${shareCards.length} Pokémon Card${shareCards.length !== 1 ? "s" : ""} for Sale`;
  const askingPrice = groupShare.askingPrice ? `$${parseFloat(String(groupShare.askingPrice)).toFixed(2)}` : null;

  const names = shareCards.slice(0, 4).map(sc => cardMap.get(sc.cardId)?.name).filter(Boolean);
  const descParts: string[] = names.length > 0 ? [names.join(", ")] : [];
  if (shareCards.length > 4) descParts.push(`+${shareCards.length - 4} more`);
  if (askingPrice) descParts.push(askingPrice);

  // Get first card image: prefer uploaded photo, fall back to TCG image
  const firstShare = shareCards[0];
  let rawImage: string | null = null;
  if (firstShare) {
    const uploadedPhotos = firstShare.images as string[];
    rawImage = (Array.isArray(uploadedPhotos) && uploadedPhotos.length > 0)
      ? uploadedPhotos[0]
      : (cardMap.get(firstShare.cardId)?.imageUrl ?? null);
  }

  const firstCard = firstShare ? cardMap.get(firstShare.cardId) : undefined;
  let accent = DEFAULT_ACCENT;
  if (firstCard) {
    let categoryColor: string | null = null;
    if (firstCard.categoryId) {
      const [cat] = await db
        .select({ color: categoriesTable.color })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, firstCard.categoryId))
        .limit(1);
      categoryColor = cat?.color ?? null;
    }
    accent = accentForCard(firstCard.rarity, categoryColor);
  }

  const imageUrl = rawImage ? borderedImageUrl(origin, rawImage, accent) : null;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `${title} on DexPoky.com`,
      description: descParts.join("  ·  "),
      imageUrl,
      cardAspect: true,
      redirectUrl: `/view/group/${code}`,
      origin,
      accentColor: accent,
    }),
  );
});

export default router;
