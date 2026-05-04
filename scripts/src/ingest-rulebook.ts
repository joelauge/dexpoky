/**
 * Ingest the Pokémon TCG rulebook PDF into structured JSON.
 *
 * The bundled JSON at `artifacts/api-server/src/data/rulebook.json` was
 * hand-curated from the official PDF (the Pokémon CDN blocks our requests).
 * This script lets you re-extract section text from any local copy of the
 * rulebook PDF for proofing, diffing, or regenerating the curated JSON.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run ingest-rulebook -- <path-to-pdf>
 *
 * Or pass a URL the script can reach:
 *   pnpm --filter @workspace/scripts run ingest-rulebook -- https://example.com/rulebook.pdf
 *
 * Outputs raw extracted text to `scripts/out/rulebook-raw.txt` for manual
 * review before promoting changes into the curated JSON.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error(
      "Usage: pnpm --filter @workspace/scripts run ingest-rulebook -- <pdf-path-or-url>",
    );
    process.exit(1);
  }

  const buf = await loadPdfBuffer(arg);
  console.log(`Loaded ${buf.byteLength.toLocaleString()} bytes; parsing…`);

  // Lazy-import keeps tsx fast when the user just wants --help.
  const pdfParseMod = await import("pdf-parse");
  const pdfParse =
    (pdfParseMod as { default?: unknown }).default ?? pdfParseMod;
  const parser = pdfParse as (
    data: Buffer | Uint8Array,
  ) => Promise<{ text: string; numpages: number }>;
  const parsed = await parser(buf);
  console.log(`Parsed ${parsed.numpages} page(s).`);

  const outDir = path.resolve(__dirname, "..", "out");
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "rulebook-raw.txt");
  await writeFile(outFile, parsed.text, "utf8");

  console.log(`Wrote raw text → ${outFile}`);
  console.log(
    "\nNext steps: review the raw text, then update artifacts/api-server/src/data/rulebook.json by hand to keep section ordering and titles clean.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
