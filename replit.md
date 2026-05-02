# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## DexPoky App

Pokemon collectible card collection, inventory tracking, and trading marketplace.

### Artifacts
- `artifacts/dexpoky` — React + Vite frontend, served at `/`
- `artifacts/api-server` — Express 5 backend, served at `/api`

### Features
- Card collection with camera scanning (getUserMedia API)
- Pokemon name search via PokeAPI
- Inventory tracking with estimated values
- Category management
- Marketplace for listing and trading cards
- Dashboard with portfolio stats and Recharts bar chart

### Database Tables
- `categories` — Card categories with name, description, color
- `cards` — Pokemon cards with rarity, condition, value, category
- `listings` — Marketplace listings with price, status

### API Routes (all at `/api`)
- `GET/POST /cards` — list and create cards
- `GET/PUT/DELETE /cards/:id` — card CRUD
- `GET/POST /categories` — list and create categories
- `GET/PUT/DELETE /categories/:id` — category CRUD
- `GET/POST /marketplace` — list and create marketplace listings
- `GET/PUT/DELETE /marketplace/:id` — listing CRUD
- `GET /inventory/stats` — portfolio summary stats
- `GET /inventory/value-by-category` — value breakdown by category
- `GET /inventory/recent-activity` — recently added cards
- `GET /pokemon/search` — search Pokemon from PokeAPI

### Codegen Note
After changes to `lib/api-spec/openapi.yaml`, run codegen then manually set `lib/api-zod/src/index.ts` to only export from `./generated/api` (orval regenerates the file with stale exports — this is a known issue with the orval zod client + split mode combo).
