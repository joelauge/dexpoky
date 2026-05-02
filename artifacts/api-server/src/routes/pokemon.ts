import { Router } from "express";

const router = Router();

router.get("/pokemon/search", async (req, res) => {
  const query = String(req.query.query ?? "").toLowerCase().trim();
  if (!query) {
    res.json([]);
    return;
  }

  try {
    const response = await fetch(
      `https://pokeapi.co/api/v2/pokemon?limit=1000`,
    );
    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch from PokeAPI" });
      return;
    }
    const data = (await response.json()) as { results: Array<{ name: string; url: string }> };

    const matches = data.results
      .filter((p) => p.name.includes(query))
      .slice(0, 10);

    const details = await Promise.all(
      matches.map(async (p) => {
        const parts = p.url.split("/").filter(Boolean);
        const id = parseInt(parts[parts.length - 1] ?? "0");
        try {
          const detailRes = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
          if (!detailRes.ok) return null;
          const detail = (await detailRes.json()) as {
            id: number;
            name: string;
            types: Array<{ type: { name: string } }>;
            sprites: { front_default: string | null };
          };
          return {
            id: detail.id,
            name: detail.name,
            spriteUrl: detail.sprites.front_default ?? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${detail.id}.png`,
            types: detail.types.map((t) => t.type.name),
          };
        } catch {
          return null;
        }
      }),
    );

    res.json(details.filter(Boolean));
  } catch {
    res.status(502).json({ error: "Failed to search Pokemon" });
  }
});

export default router;
