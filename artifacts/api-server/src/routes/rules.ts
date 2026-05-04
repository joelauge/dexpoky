import { Router } from "express";
import rulebookData from "../data/rulebook.json" with { type: "json" };
import {
  GetRulebookResponse,
  SearchRulebookResponse,
} from "@workspace/api-zod";

// `paragraphs` preserves the source PDF's paragraph chunks for snippet
// extraction and rendering (see openapi.yaml description for details).
type RulebookSection = {
  id: string;
  title: string;
  category: string;
  level: number;
  paragraphs: string[];
};

type RulebookGlossaryEntry = {
  term: string;
  definition: string;
};

type RulebookSearchIndexEntry = {
  sectionId: string;
  hits: number;
  source: "title" | "body" | "glossary";
};

type Rulebook = {
  title: string;
  source: string;
  version: string;
  ingestedAt?: string;
  sections: RulebookSection[];
  glossary: RulebookGlossaryEntry[];
  searchIndex: Record<string, RulebookSearchIndexEntry[]>;
};

const rulebook = rulebookData as Rulebook;

export function getDeckBuildingSectionText(): string {
  const s = rulebook.sections.find((x) => x.id === "deck-building");
  if (!s) return "";
  return `# ${s.title}\n${s.paragraphs.join("\n")}`;
}

const router = Router();

// Validated once at boot; reused per request.
const VALIDATED_RULEBOOK = GetRulebookResponse.parse({
  title: rulebook.title,
  source: rulebook.source,
  version: rulebook.version,
  sections: rulebook.sections,
  glossary: rulebook.glossary,
  searchIndex: rulebook.searchIndex,
});

router.get("/rules", (_req, res) => {
  res.json(VALIDATED_RULEBOOK);
});

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeSnippet(text: string, query: string, radius = 80): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

router.get("/rules/search", (req, res) => {
  const raw = (req.query.q ?? "").toString().trim();
  if (raw.length < 2) {
    res.json([]);
    return;
  }
  const query = raw.slice(0, 100);
  const needle = query.toLowerCase();
  const re = new RegExp(escapeRegex(query), "gi");

  type Hit = {
    sectionId: string;
    sectionTitle: string;
    category: string;
    snippet: string;
    matchType: "section" | "glossary";
    term: string | null;
    score: number;
  };

  const hits: Hit[] = [];

  for (const section of rulebook.sections) {
    const titleHit = section.title.toLowerCase().includes(needle);
    let bestParagraph: string | null = null;
    let paragraphMatches = 0;
    for (const p of section.paragraphs) {
      const matches = p.match(re);
      if (matches) {
        paragraphMatches += matches.length;
        if (!bestParagraph) bestParagraph = p;
      }
    }
    if (!titleHit && paragraphMatches === 0) continue;
    const score =
      (titleHit ? 10 : 0) +
      paragraphMatches +
      (section.title.toLowerCase() === needle ? 25 : 0);
    const snippet = bestParagraph
      ? makeSnippet(bestParagraph, query)
      : section.paragraphs[0]?.slice(0, 180) ?? "";
    hits.push({
      sectionId: section.id,
      sectionTitle: section.title,
      category: section.category,
      snippet,
      matchType: "section",
      term: null,
      score,
    });
  }

  for (const entry of rulebook.glossary) {
    const termHit = entry.term.toLowerCase().includes(needle);
    const defMatches = entry.definition.match(re);
    if (!termHit && !defMatches) continue;
    const score =
      (termHit ? 8 : 0) +
      (defMatches?.length ?? 0) +
      (entry.term.toLowerCase() === needle ? 30 : 0);
    hits.push({
      sectionId: "glossary",
      sectionTitle: "Glossary",
      category: "Glossary",
      snippet: `${entry.term}: ${makeSnippet(entry.definition, query)}`,
      matchType: "glossary",
      term: entry.term,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score);

  const parsed = SearchRulebookResponse.safeParse(hits.slice(0, 30));
  if (!parsed.success) {
    req.log?.error(
      { issues: parsed.error.issues },
      "rulebook search response failed schema validation",
    );
    res.status(500).json({ error: "Internal rulebook response error" });
    return;
  }
  res.json(parsed.data);
});

export default router;
