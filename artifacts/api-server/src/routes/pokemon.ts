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

interface TcgDexSet {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  cardCount?: {
    total?: number;
    official?: number;
  };
  serie?: {
    name?: string;
  };
  cards?: CardBrief[];
}

function assetUrl(value?: string): string | null {
  return value ? `${value}.png` : null;
}

function normalizeSet(set: TcgDexSet) {
  return {
    id: set.id,
    name: set.name,
    logoUrl: assetUrl(set.logo),
    symbolUrl: assetUrl(set.symbol),
    seriesName: set.serie?.name ?? null,
    releaseDate: set.releaseDate ?? null,
    totalCards: set.cardCount?.official ?? set.cardCount?.total ?? set.cards?.length ?? 0,
  };
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

router.get("/pokemon/sets", async (req, res) => {
  try {
    const setsRes = await fetch(`${TCGDEX_BASE}/sets`);
    if (!setsRes.ok) {
      res.status(502).json({ error: "Failed to load sets" });
      return;
    }

    const sets = (await setsRes.json()) as TcgDexSet[];
    res.json(Array.isArray(sets) ? sets.map(normalizeSet) : []);
  } catch (err) {
    req.log?.error({ err }, "TCGdex sets request failed");
    res.status(502).json({ error: "Failed to load sets" });
  }
});

router.get("/pokemon/sets/:id", async (req, res) => {
  try {
    const setRes = await fetch(
      `${TCGDEX_BASE}/sets/${encodeURIComponent(req.params.id)}`,
    );
    if (setRes.status === 404) {
      res.status(404).json({ error: "Set not found" });
      return;
    }
    if (!setRes.ok) {
      res.status(502).json({ error: "Failed to load set" });
      return;
    }

    const set = (await setRes.json()) as TcgDexSet;
    res.json({
      ...normalizeSet(set),
      cards: (set.cards ?? []).map((card) => ({
        id: card.id,
        localId: card.localId,
        name: card.name,
        imageUrl: card.image ? `${card.image}/high.png` : null,
      })),
    });
  } catch (err) {
    req.log?.error({ err }, "TCGdex set detail request failed");
    res.status(502).json({ error: "Failed to load set" });
  }
});

export default router;
