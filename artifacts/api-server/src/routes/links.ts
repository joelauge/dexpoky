import { Router } from "express";
import { z } from "zod";
import { requireApiKey } from "../middlewares/requireApiKey.js";
import { createShortLink } from "../lib/shorten.js";
import type { Request, Response } from "express";

const router = Router();

function getAppBaseUrl(req: Request): string {
  const fwdHost = req.headers["x-forwarded-host"];
  if (fwdHost) {
    const proto = req.headers["x-forwarded-proto"] ?? "https";
    return `${proto}://${fwdHost}`;
  }
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(",")[0].trim()}`;
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

const BuildLinkBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("listing"), id: z.number().int().positive() }),
  z.object({ type: z.literal("card"), id: z.number().int().positive() }),
  z.object({ type: z.literal("groupShare"), code: z.string().min(1) }),
  z.object({ type: z.literal("wanted"), code: z.string().min(1) }),
  z.object({ type: z.literal("collection"), ownerClerkId: z.string().optional() }),
]);

router.post("/links/build", requireApiKey, async (req: Request, res: Response) => {
  const parsed = BuildLinkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request body" });
    return;
  }

  const base = getAppBaseUrl(req);
  const data = parsed.data;
  const { apiKeyClerkId } = req as unknown as { apiKeyClerkId: string };

  let canonicalPath: string;
  switch (data.type) {
    case "listing":
      canonicalPath = `/view/listing/${data.id}`;
      break;
    case "card":
      canonicalPath = `/view/card/${data.id}`;
      break;
    case "groupShare":
      canonicalPath = `/view/group/${data.code}`;
      break;
    case "wanted":
      canonicalPath = `/w/${data.code}`;
      break;
    case "collection": {
      const owner = data.ownerClerkId ?? apiKeyClerkId;
      canonicalPath = `/view/collection?owner=${encodeURIComponent(owner)}`;
      break;
    }
  }

  const url = `${base}${canonicalPath}`;

  try {
    const code = await createShortLink(url, apiKeyClerkId);
    const shortUrl = `${base}/s/${code}`;
    res.json({ url, shortUrl });
  } catch {
    res.json({ url, shortUrl: url });
  }
});

export default router;
