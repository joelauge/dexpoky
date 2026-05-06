# DexPoky App

DexPoky is a Pokemon collectible card collection, inventory tracking, and trading marketplace with an auction system.

## Run & Operate

- `pnpm run typecheck` — Full typecheck across all packages
- `pnpm run build` — Typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — Push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — Run API server locally
- **Env Vars**: `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`

## Stack

- **Monorepo**: pnpm workspaces
- **Node.js**: 24
- **TypeScript**: 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod, `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (`@clerk/express`, `@clerk/react`)

## Where things live

- `artifacts/dexpoky` — React + Vite frontend (served at `/`)
- `artifacts/api-server` — Express 5 backend (served at `/api`)
- `artifacts/api-server/src/data/rulebook.json` — Pokémon TCG rulebook content
- `lib/api-spec/openapi.yaml` — OpenAPI specification (source of truth for API contracts)
- `lib/api-zod/src/index.ts` — Generated Zod schemas
- `lib/api-types/src/index.ts` — Generated API types
- `artifacts/api-server/src/db/schema.ts` — Drizzle DB schema (source of truth for DB schema)

## Architecture decisions

- Clerk whitelabel auth is used with separate client/server configurations, requiring specific Vite and CSS layer setups for theme compatibility.
- In-app payments integrate with Stripe for top-ups and trade settlements, including a 3% platform fee.
- "Meet at Card Shop" payment method uses a time-sensitive, hashed PIN for secure in-person transaction confirmation.
- AI deck builder (powered by OpenAI's `gpt-5.4`) post-filters suggestions based on user-owned cards and includes Pokémon TCG official deck-building rules in its prompt.
- Original card scans are uploaded to Replit Object Storage via presigned URLs, ensuring image persistence and efficient handling during card creation.
- Certain new auction/user/rating fields in the DB are not yet reflected in the OpenAPI spec; frontend uses type-casting.

## Product

- **User Authentication**: Sign-in/up via Clerk (Google, email/password).
- **Card Management**: Collect, track, and categorize Pokémon cards with estimated values. Bulk scanning feature for multiple cards.
- **Marketplace**: List cards for sale (buy now or auction) or find cards via "Looking For" listings.
- **Trading**: P2P trading inbox with rich offer history, counter-offers, and various exchange methods (including in-app payments, in-person meetups, and external services).
- **Auctions**: Proxy bidding, auto-extensions, reserve prices, and buy-it-now options.
- **Decks**: AI-powered deck builder that suggests decks from owned cards, adhering to TCG rules.
- **User Profiles**: Customizable profiles with username, bio, seller details, and avatar.
- **Ratings**: Buyer-to-seller and seller-to-buyer ratings after completed transactions.
- **Wallet**: In-app wallet with balance, top-up functionality via Stripe, and payment processing for trades.
- **Rulebook**: Integrated Pokémon TCG rulebook with search functionality, accessible in-app and during deck building.
- **Image Storage**: Secure storage and serving of card images and original scan data.

## User preferences

_Populate as you build_

## Gotchas

- `pnpm --filter @workspace/api-spec run codegen` may cause `typecheck:libs` to fail due to pre-existing errors in `lib/integrations-openai-ai-server`; this is non-blocking for `api-server` and `dexpoky`. Verify with `pnpm --filter @workspace/dexpoky exec tsc --noEmit`.
- `lib/api-zod/src/index.ts` must *only* export from `./generated/api`.
- When using Clerk on the client, do not use `publishableKeyFromHost` as it misidentifies Replit dev domains.
- `tailwindcss({ optimize: false })` is required for Clerk theme CSS compatibility in Vite.
- Ensure `@layer theme, base, clerk, components, utilities` appears before `@import "tailwindcss"` in `index.css`.

## Pointers

- **Clerk Documentation**: [https://clerk.com/docs](https://clerk.com/docs)
- **Drizzle ORM Documentation**: [https://orm.drizzle.team/docs](https://orm.drizzle.team/docs)
- **Zod Documentation**: [https://zod.dev/](https://zod.dev/)
- **Orval Documentation**: [https://orval.dev/](https://orval.dev/)
- **pnpm Workspaces**: See the `pnpm-workspace` skill documentation.
- **Replit Object Storage**: [https://docs.replit.com/misc/object-storage](https://docs.replit.com/misc/object-storage)