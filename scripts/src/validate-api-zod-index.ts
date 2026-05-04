/**
 * validate-api-zod-index.ts
 *
 * After codegen, ensure every path re-exported from lib/api-zod/src/index.ts
 * resolves to a real file.  This catches the class of bug where orval's
 * clean:true wipes a file that src/index.ts still references.
 *
 * Usage (called automatically by the codegen script):
 *   pnpm --filter @workspace/scripts run validate-api-zod-index
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/src/ → scripts/ → workspace root
const root = path.resolve(__dirname, "..", "..");
const indexPath = path.resolve(root, "lib", "api-zod", "src", "index.ts");
const indexDir = path.dirname(indexPath);

const src = fs.readFileSync(indexPath, "utf8");

// Match lines like: export * from "./some/path"  or  export { foo } from "./bar"
const exportFromRe = /^export\s+.*?\s+from\s+["']([^"']+)["']/gm;

let match: RegExpExecArray | null;
const missing: string[] = [];

while ((match = exportFromRe.exec(src)) !== null) {
  const specifier = match[1];
  // Only check relative imports
  if (!specifier.startsWith(".")) continue;

  // TypeScript allows importing without the extension; try .ts then .tsx then directory index
  const candidates = [
    specifier,
    specifier + ".ts",
    specifier + ".tsx",
    path.join(specifier, "index.ts"),
    path.join(specifier, "index.tsx"),
  ].map((s) => path.resolve(indexDir, s));

  const exists = candidates.some((c) => fs.existsSync(c));
  if (!exists) {
    missing.push(specifier);
  }
}

if (missing.length > 0) {
  console.error(
    "\n❌  lib/api-zod/src/index.ts references generated files that do not exist:\n"
  );
  for (const m of missing) {
    console.error(`   ${m}`);
  }
  console.error(
    "\nRun codegen again or update src/index.ts to match the actual orval output.\n"
  );
  process.exit(1);
}

console.log("✅  lib/api-zod/src/index.ts — all export paths resolve correctly.");
