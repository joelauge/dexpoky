import { Router, type Request } from "express";
import { db } from "@workspace/db";
import { wantedListingsTable, listingsTable, cardsTable, shortLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function getOrigin(req: Request): string {
  return req.headers["x-forwarded-host"]
    ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`
    : `${req.protocol}://${req.get("host")}`;
}

function buildHtml(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  cardAspect?: boolean;
  redirectUrl: string;
  origin: string;
  siteName?: string;
}): string {
  const { title, description, imageUrl, cardAspect, redirectUrl, origin, siteName = "DexPoky" } = opts;
  const absRedirect = redirectUrl.startsWith("http") ? redirectUrl : `${origin}${redirectUrl}`;
  const image = imageUrl ?? `${origin}/logo.png`;
  const t = title.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const d = description.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const imgW = cardAspect ? "734" : "1200";
  const imgH = cardAspect ? "1024" : "630";

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

  <!-- Instant redirect for human visitors -->
  <meta http-equiv="refresh" content="0;url=${absRedirect}">
  <script>window.location.replace(${JSON.stringify(absRedirect)});</script>
</head>
<body style="margin:0;background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;flex-direction:column;gap:12px">
  <img src="${image}" alt="" style="max-width:160px;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.6)">
  <p style="font-size:18px;font-weight:700;margin:0">${t}</p>
  <p style="font-size:14px;color:#aaa;margin:0">${d}</p>
  <p style="font-size:12px;color:#666;margin-top:8px">Redirecting to DexPoky&hellip;</p>
</body>
</html>`;
}

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

  const name = row.name ?? "A Pokémon Card";
  const parts: string[] = [];
  if (row.ownerDisplayName) parts.push(`Wanted by @${row.ownerDisplayName}`);
  if (row.setName) parts.push(row.setName);
  if (row.rarity) parts.push(row.rarity);
  if (row.maxPrice) parts.push(`Budget: $${parseFloat(String(row.maxPrice)).toFixed(2)}`);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `${name} — Looking For on DexPoky`,
      description: parts.join(" · ") || "Someone is looking for this Pokémon card on DexPoky",
      imageUrl: row.imageUrl ?? null,
      cardAspect: true,
      redirectUrl: `/w/${code}`,
      origin,
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
    })
    .from(listingsTable)
    .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
    .where(eq(listingsTable.id, id))
    .limit(1);

  if (!row) {
    res.redirect(`/view/listing/${id}`);
    return;
  }

  const cardName = row.cardName ?? "Pokémon Card";
  const price = row.price ? `$${parseFloat(String(row.price)).toFixed(2)}` : null;
  const listingImage = Array.isArray(row.listingImages) && row.listingImages.length > 0
    ? row.listingImages[0]
    : (row.cardImage ?? null);
  const isAuction = row.listingType === "auction";
  const parts: string[] = [];
  if (price) parts.push(isAuction ? `Starting at ${price}` : price);
  if (row.setName) parts.push(row.setName);
  parts.push(isAuction ? "Auction on DexPoky" : "For sale on DexPoky");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `${cardName} — ${isAuction ? "Auction" : "For Sale"} on DexPoky`,
      description: parts.join(" · "),
      imageUrl: listingImage,
      cardAspect: true,
      redirectUrl: `/view/listing/${id}`,
      origin,
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: "DexPoky — Pokémon Card Marketplace",
      description: "Trade, collect & battle — check out this Pokémon card collection",
      imageUrl: null,
      cardAspect: false,
      redirectUrl: link.targetUrl,
      origin,
    }),
  );
});

export default router;
