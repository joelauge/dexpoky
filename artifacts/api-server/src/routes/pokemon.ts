import { Router } from "express";

const router = Router();
const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

interface TcgDexCardDetail extends CardBrief {
  rarity?: string;
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

const cardRarityCache = new Map<string, string | null>();
const ASCENDED_HEROES_MEGA_ATTACK_RARE_NUMBERS = new Set([
  "265",
  "266",
  "267",
  "268",
  "269",
  "270",
  "271",
]);

function officialRarity(setId: string, localId: string, providerRarity: string | null): string | null {
  if (
    setId === "me02.5"
    && ASCENDED_HEROES_MEGA_ATTACK_RARE_NUMBERS.has(localId)
  ) {
    return "Mega Attack Rare";
  }
  return providerRarity;
}

async function loadCardRarities(cards: CardBrief[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  const uncached = cards.filter((card) => {
    if (!cardRarityCache.has(card.id)) return true;
    result.set(card.id, cardRarityCache.get(card.id) ?? null);
    return false;
  });

  const concurrency = 16;
  for (let index = 0; index < uncached.length; index += concurrency) {
    const batch = uncached.slice(index, index + concurrency);
    await Promise.all(batch.map(async (card) => {
      let rarity: string | null = null;
      try {
        const response = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(card.id)}`);
        if (response.ok) {
          const detail = (await response.json()) as TcgDexCardDetail;
          rarity = detail.rarity ?? null;
        }
      } catch {
        rarity = null;
      }
      cardRarityCache.set(card.id, rarity);
      result.set(card.id, rarity);
    }));
  }

  return result;
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
    const cards = set.cards ?? [];
    const rarities = await loadCardRarities(cards);
    res.json({
      ...normalizeSet(set),
      cards: cards.map((card) => ({
        id: card.id,
        localId: card.localId,
        name: card.name,
        imageUrl: card.image ? `${card.image}/high.png` : null,
        rarity: officialRarity(set.id, card.localId, rarities.get(card.id) ?? null),
      })),
    });
  } catch (err) {
    req.log?.error({ err }, "TCGdex set detail request failed");
    res.status(502).json({ error: "Failed to load set" });
  }
});

export default router;
