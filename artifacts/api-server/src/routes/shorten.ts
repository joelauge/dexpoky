import { Router } from "express";
import { db, shortLinksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createShortLink } from "../lib/shorten.js";

const router = Router();

router.post("/s", async (req, res) => {
  const { targetUrl, clerkId } = req.body as { targetUrl?: string; clerkId?: string };
  if (!targetUrl || typeof targetUrl !== "string") {
    res.status(400).json({ error: "targetUrl is required" });
    return;
  }

  const code = await createShortLink(targetUrl, clerkId ?? null);

  const origin = req.headers["x-forwarded-host"]
    ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"]}`
    : `${req.protocol}://${req.get("host")}`;

  res.json({ code, shortUrl: `${origin}/api/og/s/${code}` });
});

router.get("/s/:code", async (req, res) => {
  const { code } = req.params;
  const [link] = await db
    .select()
    .from(shortLinksTable)
    .where(eq(shortLinksTable.code, code))
    .limit(1);

  if (!link) {
    res.status(404).json({ error: "Link not found" });
    return;
  }

  res.json({ url: link.targetUrl });
});

export default router;
