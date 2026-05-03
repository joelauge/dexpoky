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
- Pokemon name search via PokeAPI
- Inventory tracking with estimated values
- Category management
- Marketplace for listing and trading cards (buy now + auction)
- **Auction system**: proxy bidding, 5-min auto-extension, reserve prices, buy-it-now price on auctions
- **User profiles**: username, bio, seller details (gated to qualifying bidders), avatar via Clerk
- **Ratings**: buyer-to-seller and seller-to-buyer ratings, only after completed transactions (status=sold)
- Dashboard with portfolio stats and Recharts bar chart
- **Image upload**: `CardImageUpload` component on edit and new card forms; presigned-URL upload to GCS via Replit Object Storage; served at `/api/storage/objects/*`

### Database Tables
- `categories` — Card categories with name, description, color
- `cards` — Pokemon cards with rarity, condition, value, category
- `listings` — Marketplace listings with price, status, listing_type (buy_now|auction), seller_clerk_id, auction fields (start_bid, reserve_price, current_bid, current_bidder_clerk_id, auction_end_time, min_bid_increment, buy_now_price)
- `users` — User profiles (clerk_id, username, bio, avatar_url, seller_details)
- `ratings` — Buyer/seller ratings (rater_clerk_id, rated_clerk_id, listing_id, score 1-5, comment, type)
- `auction_bids` — All bids (listing_id, bidder_clerk_id, amount, max_amount for proxy bidding)

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
After changes to `lib/api-spec/openapi.yaml`, run codegen then manually set `lib/api-zod/src/index.ts` to only export from `./generated/api` (orval regenerates the file with stale exports — this is a known issue with the orval zod client + split mode combo).

New auction/user/rating fields were added to the DB without updating the OpenAPI spec. The frontend uses type-casting (`listing as AuctionListing`) for these extended fields. Future work: update spec and regenerate hooks.
