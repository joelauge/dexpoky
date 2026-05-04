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
- **Validation**: Zod (imported as `zod` — NOT `zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Clerk (whitelabel, `@clerk/express` server + `@clerk/react` client)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## DexPoky App

Pokemon collectible card collection, inventory tracking, and trading marketplace with auction system.

### Artifacts
- `artifacts/dexpoky` — React + Vite frontend, served at `/`
- `artifacts/api-server` — Express 5 backend, served at `/api`

### Auth (Clerk)
- Whitelabel Clerk auth provisioned via `setupClerkWhitelabelAuth()`
- `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_PUBLISHABLE_KEY` set as env vars
- Server: `clerkMiddleware` + `clerkProxyMiddleware` in `app.ts` (proxy no-ops in dev)
- Client: `ClerkProvider` wraps the app inside `WouterRouter`; uses `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` directly (do NOT use `publishableKeyFromHost` on client — it misidentifies Replit dev domains)
- CSS layers: `@layer theme, base, clerk, components, utilities` must appear before `@import "tailwindcss"` in `index.css`
- Vite: `tailwindcss({ optimize: false })` required for Clerk theme CSS compatibility
- `requireAuth` middleware in `artifacts/api-server/src/middlewares/requireAuth.ts` for protected routes
- `Show` component from `@clerk/react` used for conditional auth rendering

### Features
- Card collection with camera scanning (getUserMedia API)
- **Bulk scan** (`/scan/bulk`): capture up to 25 cards, parallel background detection, review screen, Save All. Entries with zero TCG variants are marked `no_card` (not `ready`) so saveAll cannot silently no-op them. saveAll catch logs full ApiError details (status/body/sentBody) and surfaces first error in toast.
- Pokemon name search via PokeAPI
- Inventory tracking with estimated values
- Category management
- Marketplace for listing and trading cards (buy now + auction)
- **Auction system**: proxy bidding, 5-min auto-extension, reserve prices, buy-it-now price on auctions
- **User profiles**: username, bio, seller details (gated to qualifying bidders), avatar via Clerk
- **Ratings**: buyer-to-seller and seller-to-buyer ratings, only after completed transactions (status=sold)
- Dashboard with portfolio stats and Recharts bar chart
- **Image upload**: `CardImageUpload` component on edit and new card forms; presigned-URL upload to GCS via Replit Object Storage; served at `/api/storage/objects/*`
- **Original Scan storage**: scanned camera frames from `/scan` and `/scan/bulk` are uploaded to Object Storage (helper at `artifacts/dexpoky/src/lib/upload-scan.ts` — base64 dataURL → Blob → presigned PUT) and persisted to `cards.original_scan_url`. Single scan kicks off the upload in parallel with TCG identify and the "Add to Collection" button awaits the in-flight upload (max 4s) before navigating, with a small spinner. Bulk scan fires the upload per-capture, stores the resulting URL on the `BulkEntry`, and `saveAll` includes it in `createCard` body. Card detail page (`/collection/:id`) shows an "Original Scan" section under the left column (below Notes) with a 5:7 thumbnail and Dialog lightbox.
- **Decks (AI deck builder)**: build decks from owned cards. Pages at `/decks`, `/decks/new`, `/decks/:id`. Server route `artifacts/api-server/src/routes/decks.ts` with full CRUD plus `POST /api/decks/suggest` that calls OpenAI (`gpt-5.4`, `response_format: json_object`) and post-filters AI-suggested `cardId`s to ones the user actually owns. `POST /api/decks` accepts either legacy `cardIds: number[]` or rich `cards: [{cardId, count, role, notes}]` (preferred — preserves AI counts/roles, count clamped 1–4). Tables: `decksTable` + `deckCardsTable` with unique `(deck_id, card_id)` index and cascade delete. Deck detail page must use the same query key for fetch + invalidations: `[\`/api/decks/${id}\`]`.

### Database Tables
- `categories` — Card categories with name, description, color
- `cards` — Pokemon cards with rarity, condition, value, category
- `listings` — Marketplace listings with price, status, listing_type (buy_now|auction), seller_clerk_id, auction fields (start_bid, reserve_price, current_bid, current_bidder_clerk_id, auction_end_time, min_bid_increment, buy_now_price)
- `users` — User profiles (clerk_id, username, bio, avatar_url, seller_details)
- `ratings` — Buyer/seller ratings (rater_clerk_id, rated_clerk_id, listing_id, score 1-5, comment, type)
- `auction_bids` — All bids (listing_id, bidder_clerk_id, amount, max_amount for proxy bidding)
- `seller_payouts` — Seller earnings ledger (kind: sale_credit | payout_request, amount_cents, status, listing_id, stripe_session_id, payout_method, payout_destination)
- `users.payout_method` + `users.payout_destination` — saved payout destination (paypal | stripe | bank)

### Object Storage
- Bucket provisioned via `setupObjectStorage()`
- Server templates: `artifacts/api-server/src/lib/objectStorage.ts`, `objectAcl.ts`, `routes/storage.ts`
- Routes: `POST /api/storage/uploads/request-url` (get presigned URL), `GET /api/storage/objects/*` (serve uploads)
- Client component: `artifacts/dexpoky/src/components/card-image-upload.tsx` — card-shaped uploader with XHR progress, preview, replace/remove
- Upload flow: POST metadata → get presigned URL → PUT file directly to GCS → store objectPath in DB

### API Routes (all at `/api`)
- `GET/POST /cards` — list and create cards
- `GET/PUT/DELETE /cards/:id` — card CRUD
- `GET/POST /categories` — list and create categories
- `GET/PUT/DELETE /categories/:id` — category CRUD
- `GET/POST /marketplace` — list and create marketplace listings (buy_now or auction)
- `GET/PUT/DELETE /marketplace/:id` — listing CRUD
- `GET/POST /marketplace/:id/bids` — auction bids (POST requires auth; handles proxy bidding + auto-extension)
- `GET /users/me` — get own profile (auth required; auto-creates if first visit)
- `PUT /users/me` — update own profile (auth required)
- `GET /users/:clerkId` — public seller profile (seller_details hidden unless requester has bid)
- `POST /marketplace/:id/checkout` — create Stripe Checkout session for Buy Now (auth)
- `POST /marketplace/:id/confirm-purchase` — verify Stripe session, mark sold, credit seller 90% (auth)
- `GET /users/me/earnings` — seller balance + ledger history (auth)
- `PUT /users/me/payout-method` — set paypal/stripe/bank destination (auth)
- `POST /users/me/payouts/request` — request a payout from available balance (auth)
- `GET /ratings/user/:clerkId` — get all ratings for a user
- `POST /ratings` — submit rating (auth required; listing must be status=sold)
- `GET /inventory/stats` — portfolio summary stats
- `GET /inventory/value-by-category` — value breakdown by category
- `GET /inventory/recent-activity` — recently added cards
- `GET /pokemon/search` — search Pokemon from PokeAPI

### Frontend Routes
- `/` — Dashboard
- `/collection` — Card collection list
- `/collection/new` — Add new card
- `/collection/:id` — Card detail
- `/categories` — Categories
- `/marketplace` — Marketplace listing grid (auction badges, live/ended state)
- `/marketplace/:id` — Listing detail (auction UI with countdown, bid form, bid history, rating form)
- `/sell` — Sell flow: card select → listing type (buy_now|auction) → details
- `/scan` — Camera card scanner
- `/sign-in/*` — Clerk sign-in (Google + email/password)
- `/sign-up/*` — Clerk sign-up
- `/profile` — Own profile (edit bio, seller details, view ratings)
- `/seller/:clerkId` — Public seller profile (bio, ratings, contact if bid placed)

### Codegen Note
After changes to `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`. The chained `typecheck:libs` step may fail due to pre-existing errors in `lib/integrations-openai-ai-server` — that is non-blocking for the api-server (which uses esbuild) and dexpoky (which uses vite + tsc --noEmit). Verify with `pnpm --filter @workspace/dexpoky exec tsc --noEmit`.

`lib/api-zod/src/index.ts` should only export from `./generated/api` — orval's zod split mode produces a single `api.ts`, so any `./generated/api.schemas` re-export will fail to compile.

New auction/user/rating fields were added to the DB without updating the OpenAPI spec. The frontend uses type-casting (`listing as AuctionListing`) for these extended fields. Future work: update spec and regenerate hooks.
