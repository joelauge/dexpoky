import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { searchTcgdex } from "./detect-helpers.js";

const router = Router();

/** Phase 1 — OpenAI vision only. Fast identify, no TCGdex. */
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

Respond with ONLY valid JSON — no markdown, no explanation, nothing else.

If a Pokemon trading card IS visible (even partially):
{"detected": true, "confidence": "high", "pokemonName": "Pikachu"}
- confidence: "high" if clearly visible, "medium" if partially visible
- pokemonName: MUST be the Pokemon's name shown on the card — never null when detected is true

If NO Pokemon trading card is visible at all:
{"detected": false, "confidence": "low", "pokemonName": null}`,
            },
          ],
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    req.log.info({ imageSizeKB: Math.round((imageData.length * 3) / 4 / 1024), rawResponse: raw }, "identify");
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
    let parsed: { detected?: boolean; confidence?: string; pokemonName?: string | null } = {};
    try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }
    res.json({
      detected: !!parsed.detected && !!parsed.pokemonName,
      confidence: (parsed.confidence ?? "low") as "high" | "medium" | "low",
      pokemonName: parsed.pokemonName ?? null,
    });
  } catch (err) {
    req.log?.error({ err }, "Card identify failed");
    res.status(500).json({ error: "Identify failed" });
  }
});

/** Original full detect — OpenAI vision + TCGdex in one call (kept for compatibility). */
router.post("/cards/detect", async (req, res) => {
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
              text: `You are a Pokemon trading card expert. Analyze this image and respond ONLY with a JSON object (no markdown):
{
  "detected": true/false,
  "confidence": "high" | "medium" | "low",
  "pokemonName": "Charizard" or null,
  "cardName": "Charizard VMAX" or null,
  "setName": "Base Set" or null,
  "cardNumber": "4/102" or null
}
If no Pokemon card is clearly visible, return detected: false.`,
            },
          ],
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "{}").trim();
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
    let parsed: {
      detected?: boolean; confidence?: string;
      pokemonName?: string | null; cardName?: string | null;
      setName?: string | null; cardNumber?: string | null;
    } = {};
    try { parsed = JSON.parse(cleaned); } catch {
      res.json({ detected: false, confidence: "low", variants: [] }); return;
    }
    if (!parsed.detected || !parsed.pokemonName) {
      res.json({ detected: false, confidence: parsed.confidence ?? "low", variants: [] }); return;
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
