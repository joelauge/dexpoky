import { Router } from "express";

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

router.get("/pokemon/search", async (req, res) => {
  const query = String(req.query.query ?? "").trim();
  if (!query || query.length < 2) {
    res.json([]);
    return;
  }

  try {
    const searchRes = await fetch(
      `${TCGDEX_BASE}/cards?name=*${encodeURIComponent(query)}*`,
    );
    if (!searchRes.ok) {
      res.json([]);
      return;
    }

    const cards = (await searchRes.json()) as CardBrief[];
    if (!Array.isArray(cards) || cards.length === 0) {
      res.json([]);
      return;
    }

    const limited = cards.slice(0, 12);

    const setIds = [
      ...new Set(limited.map((c) => c.id.split("-")[0]).filter(Boolean)),
    ] as string[];

    const setMap: Record<string, string> = {};
    await Promise.all(
      setIds.map(async (setId) => {
        try {
          const setRes = await fetch(`${TCGDEX_BASE}/sets/${setId}`);
          if (setRes.ok) {
            const setData = (await setRes.json()) as SetBrief;
            setMap[setId] = setData.name ?? setId;
          } else {
            setMap[setId] = setId;
          }
        } catch {
          setMap[setId] = setId;
        }
      }),
    );

    const results = limited.map((card) => {
      const setId = card.id.split("-")[0] ?? "";
      const cardNumber = card.localId ?? card.id.split("-")[1] ?? "";
      const imageUrl = card.image ? `${card.image}/high.png` : "";

      return {
        id: card.id,
        name: card.name,
        imageUrl,
        setName: setMap[setId] ?? setId,
        setId,
        cardNumber,
        rarity: null,
      };
    });

    res.json(results);
  } catch (err) {
    req.log?.error({ err }, "TCGdex search failed");
    res.status(502).json({ error: "Failed to search cards" });
  }
});

export default router;
