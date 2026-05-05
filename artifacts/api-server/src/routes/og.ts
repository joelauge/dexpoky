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

/** Strip https:// / http:// to get a clean display domain. */
function cleanDomain(origin: string): string {
  return origin.replace(/^https?:\/\//, "");
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
<body style="margin:0;background:#0a0a0f;color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;box-sizing:border-box">
  <div style="text-align:center;max-width:380px;width:100%;padding:36px 32px;background:#141420;border-radius:24px;border:1px solid rgba(255,255,255,0.08);box-shadow:0 24px 64px rgba(0,0,0,.7)">
    <img src="${image}" alt="" style="max-width:${cardAspect ? "120px" : "160px"};border-radius:${cardAspect ? "10px" : "16px"};box-shadow:0 12px 40px rgba(0,0,0,.6);margin-bottom:24px;display:block;margin-left:auto;margin-right:auto">
    <p style="font-size:18px;font-weight:700;margin:0 0 10px;line-height:1.35;letter-spacing:-0.2px">${t}</p>
    <p style="font-size:13px;color:#8888aa;margin:0 0 20px;line-height:1.6">${d}</p>
    <p style="font-size:11px;color:#44445a;letter-spacing:0.5px">Redirecting&hellip;</p>
  </div>
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

  const name = row.name ?? "a Pokémon Card";
  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/w/${code}`;

  const descParts: string[] = [];
  if (row.setName) descParts.push(row.setName);
  if (row.rarity) descParts.push(row.rarity);
  if (row.maxPrice) descParts.push(`Budget: $${parseFloat(String(row.maxPrice)).toFixed(2)}`);
  descParts.push(shareUrl);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `I'm looking for ${name} on DexPoky.com`,
      description: descParts.join("  ·  "),
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

  const cardName = row.cardName ?? "a Pokémon Card";
  const price = row.price ? `$${parseFloat(String(row.price)).toFixed(2)}` : null;
  const listingImage = Array.isArray(row.listingImages) && row.listingImages.length > 0
    ? row.listingImages[0]
    : (row.cardImage ?? null);
  const isAuction = row.listingType === "auction";
  const action = isAuction ? "auctioning" : "selling";
  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/view/listing/${id}`;

  const descParts: string[] = [];
  if (row.setName) descParts.push(row.setName);
  if (price) descParts.push(isAuction ? `Starting at ${price}` : price);
  descParts.push(shareUrl);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `I'm ${action} ${cardName} on DexPoky.com`,
      description: descParts.join("  ·  "),
      imageUrl: listingImage,
      cardAspect: true,
      redirectUrl: `/view/listing/${id}`,
      origin,
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
    })
    .from(cardsTable)
    .where(eq(cardsTable.id, id))
    .limit(1);

  if (!card) {
    res.redirect(`/view/card/${id}`);
    return;
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    buildHtml({
      title: `${cardName} — My DexPoky Collection`,
      description: descParts.join("  ·  "),
      imageUrl: card.imageUrl ?? null,
      cardAspect: true,
      redirectUrl: `/view/card/${id}`,
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

  const domain = cleanDomain(origin);
  const shareUrl = `${domain}/s/${code}`;

  // Detect card links — match /api/og/card/:id or /view/card/:id
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
      })
      .from(cardsTable)
      .where(eq(cardsTable.id, cardId))
      .limit(1);

    if (card) {
      const descParts: string[] = [];
      if (card.setName) descParts.push(card.setName);
      if (card.cardNumber) descParts.push(`#${card.cardNumber}`);
      if (card.rarity) descParts.push(card.rarity);
      descParts.push(shareUrl);

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(
        buildHtml({
          title: `${card.name ?? "Pokémon Card"} — My DexPoky Collection`,
          description: descParts.join("  ·  "),
          imageUrl: card.imageUrl ?? null,
          cardAspect: true,
          redirectUrl: `/view/card/${cardId}`,
          origin,
        }),
      );
      return;
    }
  }

  // Generic fallback (collections, categories, etc.)
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

export default router;
