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

export async function searchTcgdex(query: string) {
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
