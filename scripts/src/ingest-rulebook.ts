/**
 * Ingest the Pokémon TCG rulebook PDF into the structured JSON consumed by
 * the api-server (`artifacts/api-server/src/data/rulebook.json`).
 *
 * The script:
 *   1. Loads a PDF from a local path or URL,
 *   2. Extracts plain text with `pdf-parse`,
 *   3. Splits the text into hierarchical sections (`{ id, title, level, body }`),
 *   4. Re-uses the curated category mapping from the existing JSON when possible,
 *   5. Builds a tokenized `searchIndex` (inverted index of token → posting list),
 *   6. Writes both the structured JSON (in-place) and a raw-text dump for diffing.
 *
 * Usage (re-ingest from the official PDF you have on disk):
 *   pnpm --filter @workspace/scripts run ingest-rulebook -- <path-to-pdf>
 *
 * Or pass a URL the script can reach:
 *   pnpm --filter @workspace/scripts run ingest-rulebook -- https://example.com/rulebook.pdf
 *
 * Run with no args to rebuild only the `searchIndex` + `level` fields from the
 * already-curated JSON (useful after manual section edits):
 *   pnpm --filter @workspace/scripts run ingest-rulebook
 *
 * The script is intentionally idempotent and never deletes curated section
 * text — when both a freshly extracted body and a curated body exist for the
 * same section id, the curated body wins.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// `__dirname` is `<workspace>/scripts/src` when invoked via `tsx ./src/...`.
// Two levels up reaches the pnpm workspace root that contains `artifacts/`.
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const RULEBOOK_JSON = path.resolve(
  REPO_ROOT,
  "artifacts/api-server/src/data/rulebook.json",
);
const OUT_DIR = path.resolve(__dirname, "..", "out");

interface Section {
  id: string;
  title: string;
  category: string;
  level: number;
  paragraphs: string[];
}

interface GlossaryEntry {
  term: string;
  definition: string;
}

interface SearchPosting {
  sectionId: string;
  hits: number;
  source: "title" | "body" | "glossary";
}

interface Rulebook {
  title: string;
  source: string;
  version: string;
  ingestedAt: string;
  sections: Section[];
  glossary: GlossaryEntry[];
  searchIndex: Record<string, SearchPosting[]>;
}

const STOP_WORDS = new Set(
  "a an and the of to in is it on or for if at by be as you your this that with from into can may will not no but our their they them we us i my be are was were has have had do does did so".split(
    /\s+/,
  ),
);

function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9-]{1,}/g)) {
    const t = m[0];
    if (t.length < 3) continue;
    if (STOP_WORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}

function buildSearchIndex(
  sections: Section[],
  glossary: GlossaryEntry[],
): Record<string, SearchPosting[]> {
  const index: Record<string, SearchPosting[]> = {};
  const add = (
    token: string,
    sectionId: string,
    source: SearchPosting["source"],
  ) => {
    const list = (index[token] ??= []);
    let entry = list.find((x) => x.sectionId === sectionId);
    if (!entry) {
      entry = { sectionId, hits: 0, source };
      list.push(entry);
    }
    entry.hits += 1;
  };
  for (const s of sections) {
    for (const t of tokenize(s.title)) add(t, s.id, "title");
    for (const p of s.paragraphs) {
      for (const t of tokenize(p)) add(t, s.id, "body");
    }
  }
  for (const g of glossary) {
    const sid = `glossary:${g.term.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    for (const t of tokenize(g.term)) add(t, sid, "glossary");
    for (const t of tokenize(g.definition)) add(t, sid, "glossary");
  }
  // Keep posting lists small.
  for (const [tok, list] of Object.entries(index)) {
    list.sort((a, b) => b.hits - a.hits);
    index[tok] = list.slice(0, 20);
  }
  return index;
}

async function loadPdfBuffer(source: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(source)) {
    console.log(`Fetching PDF from ${source}…`);
    const res = await fetch(source, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
        Accept: "application/pdf,*/*",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Failed to download PDF: ${res.status} ${res.statusText}`,
      );
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }
  const abs = path.isAbsolute(source)
    ? source
    : path.resolve(process.cwd(), source);
  if (!existsSync(abs)) {
    throw new Error(`PDF not found at ${abs}`);
  }
  return readFile(abs);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Heuristic section splitter. The Paradox Rift rulebook PDF uses ALL CAPS
 * headings (e.g. "DECK BUILDING") for chapters and Title Case for sub-sections.
 * We split on lines that look like headings and accumulate the body text.
 */
function splitSections(rawText: string): Section[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const sections: Section[] = [];
  let current: Section | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      const body = buffer.join(" ").trim();
      if (body) {
        current.paragraphs = body
          .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
          .map((s) => s.trim())
          .filter(Boolean);
      }
      sections.push(current);
    }
    buffer = [];
  };

  for (const line of lines) {
    const isAllCaps = /^[A-Z0-9 .,’'\-:&!?]{6,}$/.test(line) && /[A-Z]/.test(line);
    const isTitleCase =
      !isAllCaps &&
      /^[A-Z][a-zA-Z0-9]/.test(line) &&
      line.split(" ").length <= 8 &&
      line.length <= 80 &&
      !/[.!?]$/.test(line);
    if (isAllCaps || isTitleCase) {
      flush();
      current = {
        id: slugify(line),
        title: line.replace(/\s+/g, " ").trim(),
        category: isAllCaps ? line : "Section",
        level: isAllCaps ? 1 : 2,
        paragraphs: [],
      };
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return sections.filter((s) => s.paragraphs.length > 0);
}

async function loadCurated(): Promise<Rulebook> {
  const raw = await readFile(RULEBOOK_JSON, "utf8");
  return JSON.parse(raw) as Rulebook;
}

async function writeStructured(rb: Rulebook) {
  await writeFile(RULEBOOK_JSON, JSON.stringify(rb, null, 2) + "\n", "utf8");
  console.log(
    `wrote ${RULEBOOK_JSON} — sections=${rb.sections.length} glossary=${rb.glossary.length} tokens=${Object.keys(rb.searchIndex).length}`,
  );
}

async function main() {
  const arg = process.argv[2];

  // No-arg mode: rebuild searchIndex + level from existing curated JSON.
  if (!arg) {
    console.log(
      "No PDF supplied — rebuilding searchIndex + level fields from existing curated JSON.",
    );
    const curated = await loadCurated();
    for (const s of curated.sections) {
      if (typeof s.level !== "number") s.level = 2;
    }
    curated.searchIndex = buildSearchIndex(curated.sections, curated.glossary);
    curated.ingestedAt = new Date().toISOString();
    await writeStructured(curated);
    return;
  }

  const buf = await loadPdfBuffer(arg);
  console.log(`Loaded ${buf.byteLength.toLocaleString()} bytes; parsing…`);
  const pdfParseMod = await import("pdf-parse");
  const pdfParse =
    (pdfParseMod as { default?: unknown }).default ?? pdfParseMod;
  const parser = pdfParse as (
    data: Buffer | Uint8Array,
  ) => Promise<{ text: string; numpages: number }>;
  const parsed = await parser(buf);
  console.log(`Parsed ${parsed.numpages} page(s).`);

  await mkdir(OUT_DIR, { recursive: true });
  const rawOut = path.join(OUT_DIR, "rulebook-raw.txt");
  await writeFile(rawOut, parsed.text, "utf8");
  console.log(`Wrote raw text → ${rawOut}`);

  const extracted = splitSections(parsed.text);
  const curated = await loadCurated();

  // Merge: curated body wins per id; otherwise pull in the extracted body.
  const curatedById = new Map(curated.sections.map((s) => [s.id, s]));
  const mergedSections: Section[] = extracted.map((e) => {
    const c = curatedById.get(e.id);
    if (c) {
      return {
        ...c,
        level: c.level ?? e.level,
        category: c.category,
        title: c.title,
      };
    }
    return e;
  });
  // Keep curated sections that the extractor missed.
  for (const c of curated.sections) {
    if (!mergedSections.some((s) => s.id === c.id)) {
      mergedSections.push({ ...c, level: c.level ?? 2 });
    }
  }

  const merged: Rulebook = {
    title: curated.title,
    source: curated.source,
    version: curated.version,
    ingestedAt: new Date().toISOString(),
    sections: mergedSections,
    glossary: curated.glossary,
    searchIndex: buildSearchIndex(mergedSections, curated.glossary),
  };

  await writeStructured(merged);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
