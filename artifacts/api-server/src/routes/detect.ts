import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface SetBrief {
  id: string;
  name: string;
}

async function fetchSetName(setId: string): Promise<string> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
    if (!res.ok) return setId;
    const data = (await res.json()) as SetBrief;
    return data.name ?? setId;
  } catch {
    return setId;
  }
}

async function searchTcgdex(query: string) {
  try {
    const res = await fetch(
      `${TCGDEX_BASE}/cards?name=*${encodeURIComponent(query)}*`,
    );
    if (!res.ok) return [];
    const cards = (await res.json()) as CardBrief[];
    if (!Array.isArray(cards)) return [];

    const limited = cards.slice(0, 20);
    const setIds = [
      ...new Set(limited.map((c) => c.id.split("-")[0]).filter(Boolean)),
    ] as string[];

    const setMap: Record<string, string> = {};
    await Promise.all(setIds.map(async (id) => {
      setMap[id] = await fetchSetName(id);
    }));

    return limited.map((card) => {
      const setId = card.id.split("-")[0] ?? "";
      return {
        id: card.id,
        name: card.name,
        imageUrl: card.image ? `${card.image}/high.png` : "",
        setName: setMap[setId] ?? setId,
        setId,
        cardNumber: card.localId ?? card.id.split("-")[1] ?? "",
        rarity: null,
      };
    });
  } catch {
    return [];
  }
}

/** Phase 1 — OpenAI vision only, no TCGdex lookup. Fast. */
router.post("/cards/identify", async (req, res) => {
  const { imageData } = req.body as { imageData?: string };
  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" });
    return;
  }
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageData, detail: "low" } },
            {
              type: "text",
              text: `You are a Pokemon trading card expert. Examine this image carefully.

Respond with ONLY valid JSON, no markdown, no explanation:
{"detected": true, "confidence": "high", "pokemonName": "Pikachu"}

Rules:
- Set "detected" to true if ANY Pokemon trading card is visible, even partially
- "pokemonName": the Pokemon's name on the card (e.g. "Pikachu", "Charizard", "Mewtwo")
- "confidence": "high" if clearly visible, "medium" if partially visible, "low" if uncertain but likely
- If absolutely no Pokemon card is present, respond exactly: {"detected": false, "confidence": "low", "pokemonName": null}`,
            },
          ],
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "{}").trim();
    req.log.info({ imageSizeKB: Math.round((imageData.length * 3) / 4 / 1024), rawResponse: raw }, "identify response");
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
    let parsed: { detected?: boolean; confidence?: string; pokemonName?: string | null } = {};
    try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }
    res.json({
      detected: !!parsed.detected && !!parsed.pokemonName,
      confidence: parsed.confidence ?? "low",
      pokemonName: parsed.pokemonName ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "Card identify failed");
    res.status(500).json({ error: "Identify failed" });
  }
});

/** Phase 2 — TCGdex lookup by pokemon name, returns card + variants. */
router.get("/cards/lookup", async (req, res) => {
  const name = String(req.query.name ?? "").trim();
  if (!name) { res.status(400).json({ error: "name is required" }); return; }
  const variants = await searchTcgdex(name);
  res.json({ card: variants[0] ?? null, variants });
});

router.post("/cards/detect", async (req, res) => {
  const { imageData } = req.body as { imageData?: string };

  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" });
    return;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageData, detail: "low" },
            },
            {
              type: "text",
              text: `You are a Pokemon trading card expert. Analyze this image and respond ONLY with a JSON object (no markdown, no explanation):
{
  "detected": true/false,
  "confidence": "high" | "medium" | "low",
  "pokemonName": "Charizard" or null,
  "cardName": "Charizard VMAX" or null (only if different from pokemonName),
  "setName": "Base Set" or null,
  "cardNumber": "4/102" or null
}
If no Pokemon card is clearly visible, return detected: false with confidence: low.`,
            },
          ],
        },
      ],
    });

    const raw = (completion.choices[0]?.message?.content ?? "{}").trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");

    let parsed: {
      detected?: boolean;
      confidence?: string;
      pokemonName?: string | null;
      cardName?: string | null;
      setName?: string | null;
      cardNumber?: string | null;
    } = {};

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      res.json({ detected: false, confidence: "low", variants: [] });
      return;
    }

    if (!parsed.detected || !parsed.pokemonName) {
      res.json({
        detected: false,
        confidence: parsed.confidence ?? "low",
        variants: [],
      });
      return;
    }

    const searchName = parsed.cardName ?? parsed.pokemonName;
    const variants = await searchTcgdex(searchName);

    res.json({
      detected: true,
      confidence: parsed.confidence ?? "medium",
      pokemonName: parsed.pokemonName,
      cardName: parsed.cardName ?? parsed.pokemonName,
      setName: parsed.setName,
      cardNumber: parsed.cardNumber,
      card: variants[0] ?? null,
      variants,
    });
  } catch (err) {
    req.log?.error({ err }, "Card detection failed");
    res.status(500).json({ error: "Detection failed" });
  }
});

export default router;
