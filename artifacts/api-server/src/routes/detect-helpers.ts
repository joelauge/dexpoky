const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";

const STOP_WORDS = new Set(["the", "a", "an", "of", "and", "or", "ex", "v", "gx", "vmax", "vstar"]);

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

async function fetchCards(namePattern: string): Promise<CardBrief[]> {
  try {
    const res = await fetch(`${TCGDEX_BASE}/cards?name=${encodeURIComponent(namePattern)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function buildResults(cards: CardBrief[]) {
  const limited = cards.slice(0, 20);
  const setIds = [...new Set(limited.map((c) => c.id.split("-")[0]).filter(Boolean))] as string[];
  const setMap: Record<string, string> = {};
  await Promise.all(setIds.map(async (id) => { setMap[id] = await fetchSetName(id); }));
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
}

export async function searchTcgdex(query: string) {
  try {
    // Strategy 1: exact wildcard on the full query
    const full = await fetchCards(`*${query}*`);
    if (full.length > 0) return buildResults(full);

    // Strategy 2: search each significant word independently, merge & deduplicate
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    if (words.length === 0) return [];

    const perWord = await Promise.all(words.map((w) => fetchCards(`*${w}*`)));
    const seen = new Set<string>();
    const merged: CardBrief[] = [];
    for (const batch of perWord) {
      for (const card of batch) {
        if (!seen.has(card.id)) {
          seen.add(card.id);
          merged.push(card);
        }
      }
    }

    // Rank: cards whose name contains MORE of the query words score higher
    const queryWords = new Set(words);
    merged.sort((a, b) => {
      const scoreA = a.name.toLowerCase().split(/\s+/).filter((w) => queryWords.has(w)).length;
      const scoreB = b.name.toLowerCase().split(/\s+/).filter((w) => queryWords.has(w)).length;
      return scoreB - scoreA;
    });

    return buildResults(merged);
  } catch {
    return [];
  }
}
