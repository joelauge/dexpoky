import { Router } from "express";
import OpenAI from "openai";
import { openai as integrationOpenai } from "@workspace/integrations-openai-ai-server";
import { searchTcgdex } from "./detect-helpers.js";

const router = Router();

// Prefer user-supplied OPENAI_API_KEY (direct OpenAI). Fall back to Replit AI integration.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : integrationOpenai;

/** Phase 1 — OpenAI vision only. Fast identify, no TCGdex. */
router.post("/cards/identify", async (req, res) => {
  const { imageData, cornerImageData } = req.body as {
    imageData?: string;
    cornerImageData?: string;
  };
  if (!imageData || typeof imageData !== "string") {
    res.status(400).json({ error: "imageData is required" });
    return;
  }
  try {
    const imageContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
      { type: "image_url", image_url: { url: imageData, detail: "high" } },
    ];
    if (cornerImageData && typeof cornerImageData === "string") {
      imageContent.push({ type: "image_url", image_url: { url: cornerImageData, detail: "high" } });
    }
    const promptText = cornerImageData
      ? `You are a Pokémon TCG card expert with perfect OCR ability.

You have been given TWO images:
1. The full card — use this to identify the Pokémon name and HP.
2. A zoomed crop of the bottom strip of the same card — use this to read the small set code and card number printed there (e.g. "PFL EN 002/094").

Respond with ONLY valid JSON — no markdown, no explanation, nothing else.

If a Pokémon trading card IS visible (even partially):
{"detected":true,"confidence":"high","pokemonName":"Gloom","setCode":"PFL","cardNumber":"002","hp":70,"visualSummary":"Describe only visible artwork and markings here."}

Fields:
 - confidence: "high" only if the name AND identifiers are clearly readable; "medium" if some identifying details are uncertain; "low" if mostly unclear
 - pokemonName: the card's printed title, including "Basic Fire Energy" or a Trainer title (REQUIRED, never null when detected)
 - setCode: the abbreviated set code in the bottom strip, usually 2-6 letters or digits (e.g. "30C", "MEE", "PFL", "SVI", "PAF", "SVP", "SV5", "SWSH") — read it from the zoomed image; do not include the language suffix
 - cardNumber: the collector identifier before the slash (e.g. "002" from "002/094", or "FIR", "TG01") — read it from the zoomed image, not an illustrator/copyright code
- hp: the HP value as a plain integer from the top-right of the card (e.g. 70)
 - visualSummary: up to two short sentences describing OBSERVED artwork, borders, readable illustrator/copyright text, language and distinctive stamps/logos (especially anniversary markings). Say when these details are not legible. Never invent a set, printing, foil finish, stamp or absent marking. This text will help compare catalog printings; it is not a catalog identification.

All fields except pokemonName may be null if not legible.

If NO Pokémon trading card is visible at all:
{"detected":false,"confidence":"low","pokemonName":null,"setCode":null,"cardNumber":null,"hp":null,"visualSummary":null}`
      : `You are a Pokémon TCG card expert with perfect OCR ability. Examine every part of this image carefully, including small text at the bottom of the card.

Respond with ONLY valid JSON — no markdown, no explanation, nothing else.

If a Pokémon trading card IS visible (even partially):
{"detected":true,"confidence":"high","pokemonName":"Gloom","setCode":"PFL","cardNumber":"002","hp":70,"visualSummary":"Describe only visible artwork and markings here."}

Fields:
 - confidence: "high" only if the name AND identifiers are clearly readable; "medium" if some identifying details are uncertain; "low" if mostly unclear
 - pokemonName: the card's printed title, including "Basic Fire Energy" or a Trainer title (REQUIRED, never null when detected)
 - setCode: the abbreviated set code printed at the bottom, usually 2-6 letters or digits (e.g. "30C", "MEE", "PFL", "SVI", "PAF", "SVP", "SV5", "SWSH") — read it carefully; do not include the language suffix
 - cardNumber: the collector identifier before the slash (e.g. "002" from "002/094", or "FIR", "TG01") — if no slash is found, use the full identifier; do not mistake an illustrator/copyright code for the collector number
- hp: the HP value as a plain integer from the top-right of the card (e.g. 70)
 - visualSummary: up to two short sentences describing OBSERVED artwork, borders, readable illustrator/copyright text, language and distinctive stamps/logos (especially anniversary markings). Say when these details are not legible. Never invent a set, printing, foil finish, stamp or absent marking. This text will help compare catalog printings; it is not a catalog identification.

All fields except pokemonName may be null if not legible.

If NO Pokémon trading card is visible at all:
{"detected":false,"confidence":"low","pokemonName":null,"setCode":null,"cardNumber":null,"hp":null,"visualSummary":null}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            ...imageContent,
            { type: "text", text: promptText },
          ],
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content ?? "").trim();
    req.log.info({ imageSizeKB: Math.round((imageData.length * 3) / 4 / 1024), hasCorner: !!cornerImageData, rawResponse: raw }, "identify");
    const cleaned = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "");
    let parsed: {
      detected?: boolean;
      confidence?: string;
      pokemonName?: string | null;
      setCode?: string | null;
      cardNumber?: string | null;
      hp?: number | null;
      visualSummary?: string | null;
    } = {};
    try { parsed = JSON.parse(cleaned); } catch { /* ignore */ }
    res.json({
      detected: !!parsed.detected && !!parsed.pokemonName,
      confidence: parsed.confidence === "high" || parsed.confidence === "medium" ? parsed.confidence : "low",
      pokemonName: parsed.pokemonName ?? null,
      setCode: parsed.setCode ?? null,
      cardNumber: parsed.cardNumber ?? null,
      hp: parsed.hp ?? null,
      visualSummary: typeof parsed.visualSummary === "string" ? parsed.visualSummary.slice(0, 1000) : null,
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
    const { variants, pricing } = await searchTcgdex(searchName);
    res.json({
      detected: true,
      confidence: parsed.confidence ?? "medium",
      pokemonName: parsed.pokemonName,
      cardName: parsed.cardName ?? parsed.pokemonName,
      setName: parsed.setName,
      cardNumber: parsed.cardNumber,
      card: variants[0] ?? null,
      variants,
      pricing,
    });
  } catch (err) {
    req.log?.error({ err }, "Card detection failed");
    res.status(500).json({ error: "Detection failed" });
  }
});

export default router;
