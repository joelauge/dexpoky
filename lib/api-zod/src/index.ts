// Import directly from the generated file rather than from ./generated/index.ts.
//
// WHY: orval's "zod" target with mode:"split" and target:"api" emits:
//   generated/api/api.ts          ← Zod schemas (the only output)
//   generated/index.ts            ← barrel that re-exports ./api/api AND ./api/api.schemas
//
// The barrel's re-export of ./api/api.schemas is wrong — the zod generator
// never emits api.schemas.ts, only api.ts.  Because clean:true wipes the
// generated/ directory on every codegen run, that leftover barrel entry
// breaks the build immediately after regeneration.
//
// Importing the concrete file directly keeps us immune to whatever the
// generated barrel says.  If you need to add more exports here, check
// lib/api-spec/orval.config.ts for the exact filenames orval will emit.
export * from "./generated/api/api";
