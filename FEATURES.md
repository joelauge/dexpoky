# DexPoky — Complete Feature Reference

This document describes every feature of DexPoky in enough detail that an AI agent can
recreate the full application from scratch on a new server. Each section covers what the
feature does, how it is wired together (DB tables, API routes, frontend pages), and any
non-obvious implementation details.

---

## Table of Contents

1. [Authentication & User Management](#1-authentication--user-management)
2. [Card Collection](#2-card-collection)
3. [Card Scanning](#3-card-scanning)
4. [Pokémon TCG Card Catalog](#4-pokémon-tcg-card-catalog)
5. [Categories](#5-categories)
6. [Wishlist](#6-wishlist)
7. [AI Deck Builder](#7-ai-deck-builder)
8. [Searchable Rulebook](#8-searchable-rulebook)
9. [Marketplace Listings](#9-marketplace-listings)
10. [Auctions](#10-auctions)
11. ["Looking For" (Wanted) Listings](#11-looking-for-wanted-listings)
12. [P2P Trading Inbox](#12-p2p-trading-inbox)
13. [Payment System](#13-payment-system)
14. [Seller Wallet & Earnings](#14-seller-wallet--earnings)
15. [Ratings & Trust System](#15-ratings--trust-system)
16. [Notifications (SSE, Push, Email, SMS)](#16-notifications-sse-push-email-sms)
17. [Sharing & OG Cards](#17-sharing--og-cards)
18. [DexAgents (Automated Trading Agents)](#18-dexagents-automated-trading-agents)
19. [Developer SDK & API Keys](#19-developer-sdk--api-keys)
20. [SDK Outreach & Invite Tracking](#20-sdk-outreach--invite-tracking)
21. [Subscription & Billing](#21-subscription--billing)
22. [Admin Panel](#22-admin-panel)
23. [Username System & Anonymous Trainer](#23-username-system--anonymous-trainer)
24. [Public Profiles & Seller Pages](#24-public-profiles--seller-pages)
25. [Backup & GitHub Sync](#25-backup--github-sync)

---

## 1. Authentication & User Management

### What it does
Users sign in or register with email/password or Google OAuth via Clerk. A user record
is created in the local PostgreSQL `users` table on first authenticated request so the
app can store app-specific fields (username, bio, wallet balance, etc.) alongside the
Clerk identity.

### Implementation

**Auth provider:** Clerk (`@clerk/express` server-side, `@clerk/react` client-side).
Publishable key set via `VITE_CLERK_PUBLISHABLE_KEY` (frontend) and
`CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (backend).

**User sync (`requireAuth` middleware):**
Every protected API route runs `requireAuth`, which:
1. Verifies the Clerk JWT from the `Authorization: Bearer <token>` header.
2. Calls `ensureUserSynced(clerkId)` — upserts a row in `usersTable` using
   `ON CONFLICT DO NOTHING` to avoid duplicate-key errors on concurrent requests.
3. Attaches `req.userId` (Clerk ID string) to the request for downstream handlers.

**DB table:** `usersTable` — fields: `clerkId` (PK), `email`, `username` (unique,
nullable), `bio`, `avatarUrl`, `sellerDescription`, `stripeCustomerId`,
`walletBalanceCents` (integer, default 0).

**Username gate (`UsernameGate` component):**
After sign-up, users without a username see a modal prompting them to set one. The gate
wraps all protected routes so no navigation is possible until a username is chosen or
explicitly dismissed. Usernames must match `/^[a-zA-Z0-9_]{3,30}$/` — no spaces, no
first/last name leakage.

**Clerk webhook (`/api/clerk-webhook`):**
Listens for `user.created` and `user.updated` events to keep the local `users` table
in sync when profile data changes in Clerk (e.g. email change).

**Profile page (`/profile`):**
Lets users edit their username, bio, seller description, and avatar. Avatar is uploaded
to Replit Object Storage via presigned URL; the stored path is saved in `usersTable`.

---

## 2. Card Collection

### What it does
Users maintain a personal inventory of Pokémon cards with estimated values, condition
grading, rarity, set information, and photos. Cards can be listed for sale directly
from the collection.

### Implementation

**DB table:** `cardsTable` — fields: `id`, `clerkId` (owner), `name`, `pokemonName`,
`setName`, `setCode`, `cardNumber`, `rarity` (enum: common/uncommon/rare/holo_rare/
ultra_rare/secret_rare/promo), `condition` (enum: mint/near_mint/excellent/good/
light_played/played/poor), `estimatedValue` (integer cents), `listingPrice` (nullable),
`forSale` (boolean), `imageUrl` (nullable, object storage path), `originalScanUrl`
(nullable, raw scan path), `agentAcquiredAt` (nullable timestamp, set when a DexAgent
buys the card).

**API routes (all require auth):**
- `GET /api/cards` — list the authenticated user's cards, with optional filters.
- `POST /api/cards` — create a new card; validates with Zod schema.
- `GET /api/cards/:id` — single card detail.
- `PUT /api/cards/:id` — update card fields (only owner).
- `DELETE /api/cards/:id` — delete card (only owner, must not be in an active listing).

**Frontend pages:**
- `/collection` — grid of `CardItem` components (Framer Motion hover lift, `aspect-[3/4]`).
  Includes a `CardSizeSlider` (persisted in `localStorage`) to control grid column width.
- `/collection/new` — form to manually add a card, with `CardImageUpload` component
  that requests a presigned URL then uploads directly to GCS.
- `/collection/:id` — card detail with full metadata, price history chart, and
  "List for Sale" button.
- `/collection/:id/edit` — edit form for all card fields.

**Image storage:**
Card photos are stored in Replit Object Storage (GCS-backed). Upload flow: client calls
`POST /api/storage/uploads/request-url` → API returns a presigned GCS PUT URL → client
uploads the file bytes directly to GCS → client saves the returned `objectPath` in the
card record. Images are served via `GET /api/storage/objects/<path>` with ACL checks
(owner or public if card is listed).

**Categories:**
Cards can be assigned to user-defined categories (see §5). The collection page can be
filtered by category.

---

## 3. Card Scanning

### What it does
Users can point their phone camera at a physical Pokémon card and the app identifies it
using AI vision + the TCGdex API. Two scan modes: single-card and bulk.

### Implementation

**Single scan (`/scan`):**
1. Browser `getUserMedia` opens the rear camera (with a flip-camera toggle).
2. Camera viewfinder fills the full available vertical space between header and buttons.
3. User taps "Take Photo" → the frame is captured as a JPEG blob.
4. Client calls `POST /api/detect` with the image (base64 or blob).
5. Server uses OpenAI Vision (`gpt-4o`) to extract: card name, set name, set code,
   card number, condition, rarity, and estimated value from the card image.
6. The extracted `setCode` + `cardNumber` are used to query TCGdex
   (`GET /v2/en/cards?name=<name>&localId=<cardNumber>`) for an exact match, which
   returns the official card image URL and metadata.
7. Results shown in a confirmation screen. User can accept, re-scan, or manually adjust
   before the card is added to their collection.

**Bulk scan (`/scan/bulk`):**
- Same camera setup (full-screen viewfinder).
- User captures multiple photos in sequence; each captured photo appears as a thumbnail
  strip visible above the control buttons (fixed layout so thumbnails don't scroll out
  of view during capture).
- Tapping a thumbnail opens a preview sheet showing the identified result for that card;
  the user can trigger a re-identify or accept.
- After the capture phase, a review screen shows all identified cards for batch confirmation.

**Pinpoint lookup (`/api/detect` step 2):**
When both `setCode` and `cardNumber` are extracted, the server queries TCGdex with both
fields simultaneously for near-100% accuracy. When only the name is available, it falls
back to a name-only search and re-ranks results.

**Scan usage gating:**
`scan_usage` table tracks monthly scan counts per user. Free tier allows N scans/month;
paid subscribers (via Stripe) get unlimited. `GET /api/billing/status` returns
`{ scansUsed, scansAllowed, tier }`. The scan confirmation screen shows a paywall if
the limit is reached (`ScanPaywall` component).

**Corner zoom:**
The server-side detect endpoint crops to the bottom-right corner of the card image to
find the set code and card number printed there, improving extraction accuracy.

---

## 4. Pokémon TCG Card Catalog

### What it does
A searchable catalog of every Pokémon TCG card ever printed, used across wishlist
creation, deck building, and marketplace listings. Backed by the PokeWallet API
(`https://api.pokewallet.io`).

### Implementation

**API proxy route (`/api/pokemon/search`):**
The server proxies catalog search requests to the PokeWallet API to avoid CORS and
to keep the API key server-side. Returns card name, set, image URL, and market price.

**`CatalogSearch` component:**
A typeahead input that debounces queries and shows card thumbnails in the dropdown.
Used in:
- Wishlist item addition (`/wishlist`)
- Deck builder catalog tab (`/decks/new`, `/decks/:id`)
- "Looking For" listing creation

**Price reference:**
PokeWallet market prices are used as the estimated value suggestion when manually adding
a card to the collection.

---

## 5. Categories

### What it does
User-defined folders for organizing their collection. Each category has a name and an
optional color. Cards can be assigned to one category.

### Implementation

**DB table:** `categoriesTable` — `id`, `clerkId`, `name`, `color` (hex string,
nullable), `createdAt`.

**API routes:** `GET /api/categories`, `POST /api/categories`, `PUT /api/categories/:id`,
`DELETE /api/categories/:id` (all require auth, owner-scoped).

**Public sharing:** Categories can be shared publicly. `GET /view/category/:id` renders
a public read-only view of a category's cards with a dark gradient hero header.

---

## 6. Wishlist

### What it does
A list of Pokémon cards the user wants to acquire. Wishlist entries can come from
the card catalog (with official image and price) or be entered manually. The AI deck
builder checks the wishlist when suggesting decks for users with no owned cards.

### Implementation

**DB table:** `wishlistTable` — `id`, `clerkId`, `name`, `setName`, `imageUrl`,
`catalogCardId` (nullable, references PokeWallet entry), `addedAt`.

**API routes:** `GET /api/wishlist`, `POST /api/wishlist`, `DELETE /api/wishlist/:id`
(auth required, owner-scoped).

**Frontend (`/wishlist`):** Grid layout using the same `CardItem` component as the
collection, with a "Find on Marketplace" button linking to a pre-filtered marketplace
search. `CatalogSearch` dropdown for adding new entries.

---

## 7. AI Deck Builder

### What it does
Suggests a legal Pokémon TCG deck from the user's owned cards (and optionally their
wishlist or the full catalog). The AI respects official deck-building rules and
post-filters suggestions to only include cards the user owns or could realistically
acquire.

### Implementation

**Model:** OpenAI `gpt-5.4` (or latest available GPT-4-class model). The full Pokémon
TCG rulebook text is included in the system prompt so the model produces rule-compliant
decks.

**Deck-building rules enforced in prompt:**
- Exactly 60 cards per deck.
- Max 4 copies of any card with the same name (except Basic Energy).
- Must include a legal number of Pokémon, Trainer cards, and Energy cards.
- No banned cards (list included in prompt).

**Empty collection handling:**
If the user has no owned cards, the builder still runs with the wishlist as the card
pool, or suggests a "starter shopping list" of catalog cards the user could buy to
build the suggested deck. Cards not owned are marked with an amber badge.

**DB tables:** `decksTable` — `id`, `clerkId`, `name`, `suggestedCards` (JSONB array),
`createdAt`. Each suggested card entry: `{ name, setName, count, owned, source }`.

**API routes:**
- `POST /api/decks` — generate a new deck suggestion (calls OpenAI, stores result).
- `GET /api/decks` — list user's saved decks.
- `GET /api/decks/:id` — deck detail with card list.
- `DELETE /api/decks/:id` — delete a deck.

**Frontend pages:** `/decks` (list), `/decks/new` (wizard with card pool selection),
`/decks/:id` (detail view showing each card with owned/wishlist/catalog badges and
role labels: attacker, supporter, trainer, energy).

**Rules sheet:**
A `RulesSheet` slide-out panel is available on the deck detail page showing the full
TCG rulebook without leaving the deck view.

---

## 8. Searchable Rulebook

### What it does
The full official Pokémon TCG rulebook is available in-app with full-text search.
Accessible from the sidebar nav and from within the deck builder.

### Implementation

**Data:** The rulebook PDF is parsed and stored as structured JSON at
`artifacts/api-server/src/data/rulebook.json`. Each entry has `section`, `title`, and
`content` fields. The `scripts/src/ingest-rulebook.ts` script does the PDF → JSON
conversion using `pdf-parse`.

**API route:** `GET /api/rules/search?q=<query>` — performs case-insensitive substring
search across all rulebook entries and returns matching sections.

**Frontend pages:**
- `/rules` — full browsable rulebook with a search input at the top.
- `RulesSheet` component — a shadcn `Sheet` overlay embedding the same search UI,
  usable from inside deck detail pages without navigation.

---

## 9. Marketplace Listings

### What it does
Sellers list cards for sale (Buy Now or Auction). Any visitor (including unauthenticated
users) can browse listings. Authenticated buyers can message sellers or make payments.

### Implementation

**DB table:** `listingsTable` — `id`, `cardId` (FK → cardsTable), `sellerClerkId`,
`price` (integer cents), `listingType` (enum: buy_now / auction), `status` (enum:
active / sold / cancelled), `description`, `startBid`, `reservePrice`, `buyNowPrice`,
`auctionEndTime`, `viewCount`, `ownerDisplayName` (must be username — no-spaces CHECK
constraint enforced at DB level to prevent first/last name leakage).

**API routes:**
- `GET /api/marketplace` — paginated listing feed with filters (rarity, condition,
  price range, listing type, search term). Public endpoint.
- `GET /api/marketplace/:id` — listing detail including bid count and view count
  (returned to the seller for the edit UI).
- `POST /api/marketplace` — create listing. Requires auth.
- `PUT /api/marketplace/:id` — edit listing. Owner only. Buyer-activity guardrails:
  - Changing price on an auction with existing bids returns HTTP 409.
  - Changing `startBid`, `reservePrice`, or `buyNowPrice` after any bid → 409.
  - Condition is locked (read-only) after listing creation.
- `DELETE /api/marketplace/:id` — cancel listing (owner only).

**Edit UI:**
Sellers see an inline "Edit listing" panel on their own listing detail page showing
bid count and view count ("3 bids · 142 views"). Condition is shown as a read-only
badge. Price changes on auctioned listings with bids require a confirmation modal.

**Frontend pages:**
- `/marketplace` (public) — two-tab layout: "Find/Buy" (active listings grid + filter
  sidebar) and "Looking For" (wanted listings feed).
- `/marketplace/:id` — listing detail with image, seller info, trust badge, pricing,
  and action buttons (Buy Now / Place Bid / Message Seller).
- `/sell` — create listing form (card picker, pricing, listing type, description).
- `/share` — seller dashboard: active listings, My Requests (wanted listings), quick
  share links.

**OG share cards:**
Each listing has an OG redirect page (`/view/listing/:id`) with a 3D-tilt card image,
a rarity-derived colored border, and correct `og:image` meta tags so iMessage previews
show the card thumbnail. Short URLs (`/s/:code`) resolve to these pages.

---

## 10. Auctions

### What it does
Sellers can list cards as auctions with a start bid, optional reserve price, optional
buy-it-now price, and an end time. Proxy bidding automatically increases bids up to
the bidder's maximum.

### Implementation

**DB table:** `auctionBidsTable` — `id`, `listingId`, `bidderClerkId`, `amountCents`,
`maxAmountCents` (proxy bid ceiling), `createdAt`.

**Proxy bidding logic (server-side on `POST /api/bids`):**
1. Receive `{ listingId, maxAmountCents }`.
2. Find current highest bid.
3. New bid must beat the current bid by at least 1 cent.
4. The displayed current bid is set to the minimum needed to beat the second-highest
   max bid (eBay-style proxy bidding).
5. If the listing has a `buyNowPrice` and the new max bid meets or exceeds it, offer
   the buyer the option to buy now immediately.

**Auto-extension:**
If a bid arrives within the final 5 minutes of an auction, the end time is extended
by 5 minutes (prevents sniping).

**API routes:**
- `GET /api/bids?listingId=<id>` — bid history for a listing.
- `POST /api/bids` — place a bid. Validates auth, validates listing is active, runs
  proxy logic, updates `listingsTable.currentBid`.

---

## 11. "Looking For" (Wanted) Listings

### What it does
Buyers can broadcast which specific Pokémon cards they are searching for. Sellers can
browse the feed and message buyers. When a seller lists a matching card, active "Looking
For" requests for that card receive an in-app activity event and an email notification.

### Implementation

**DB table:** `wantedListingsTable` — `id`, `ownerClerkId`, `ownerDisplayName`
(username-only, CHECK constraint — no spaces), `cardName`, `setName` (nullable),
`rarity` (nullable), `maxPrice` (integer cents, nullable), `notes`, `status` (enum:
active / found / deleted), `shortCode` (unique 8-char random string for public URL),
`imageUrl` (nullable, card catalog image), `createdAt`.

**API routes:**
- `GET /api/wanted` — paginated public feed of active requests.
- `GET /api/wanted/mine` — authenticated user's own requests (all statuses).
- `POST /api/wanted` — create a new request. Requires auth + username set.
- `PATCH /api/wanted/:id` — mark as found or edit (owner only).
- `DELETE /api/wanted/:id` — delete request (owner only).

**Public page (`/w/:shortCode`):**
Dark gradient hero page showing the card thumbnail, buyer's username, max price badge,
notes, and a "I have this card" CTA button that opens a contact dialog (starts a DM
thread with the buyer).

**Match notifications:**
When a new marketplace listing is created, the server queries `wantedListingsTable` for
active requests matching the card name (case-insensitive, partial match). For each
match, it creates an `activity_events` row for the buyer and attempts to send a Clerk
email notification (async, non-blocking). The notification respects the buyer's max
price if set — listings priced above the buyer's max are not notified.

**My Requests (on `/share` page):**
Shows the authenticated seller/buyer's wanted listings with status badges, card
thumbnails, copy-link button, and a "View" link to the public page. Includes a
history of fulfilled requests.

---

## 12. P2P Trading Inbox

### What it does
A full-featured P2P messaging system where buyers and sellers negotiate trades. Threads
support rich offer management (propose, counter-offer, accept, decline), choice of
exchange method, and integrated payment flows.

### Implementation

**DB tables:**
- `dmThreadsTable` — `id`, `buyerClerkId`, `sellerClerkId`, `listingId` (nullable,
  FK → listings), `wantedListingId` (nullable), `status` (enum: open/closed).
- `dmMessagesTable` — `id`, `threadId`, `senderClerkId`, `content`, `type` (enum:
  text/offer/counter/accept/decline/system), `metadata` (JSONB), `createdAt`,
  `readAt` (nullable).
- `tradeOffersTable` — `id`, `threadId`, `proposerClerkId`, `agreedPricePathCents`
  (integer), `exchangeMethod` (enum: dexpoky_pay/store/escrow/psa_vault/paypal_gs/
  cash), `status` (enum: pending/accepted/declined/paid/cancelled),
  `exchangeMethodConfirmedBySeller` (boolean),
  `storeMeetupPinHash` (nullable text, HMAC-SHA256),
  `storeMeetupPinExpiresAt` (nullable timestamp).
- `tradePaymentsTable` — `id`, `threadId`, `offerId`, `buyerClerkId`, `sellerClerkId`,
  `amountCents`, `feeCents` (3% platform fee), `netCents`, `method` (enum),
  `status`, `stripeSessionId` (nullable), `createdAt`.

**API routes:**
- `GET /api/threads` — list all threads for the authenticated user with unread counts.
- `GET /api/threads/:id` — thread detail with messages and offer state.
- `POST /api/threads` — create a new thread (from marketplace listing or wanted listing).
- `POST /api/threads/:id/messages` — send a text message.
- `POST /api/threads/:id/offer` — propose a trade offer.
- `PATCH /api/threads/:id/offer` — update offer: accept / decline / counter-offer /
  confirm exchange method / `confirm_store_meetup` (buyer enters store PIN).
- `POST /api/threads/:id/payment/wallet` — pay with DexPoky wallet balance.
- `POST /api/threads/:id/payment/checkout` — create Stripe Checkout session for card payment.
- `POST /api/threads/:id/payment/store-meetup` — generate a 6-digit store meetup PIN
  (seller only); `PATCH` with `action: "confirm_store_meetup"` validates and pays.

**Exchange methods:**
- `dexpoky_pay` — in-app payment (wallet balance first, Stripe card fallback).
- `store` — "Meet at Card Shop" in-person PIN flow (see §13).
- `escrow` — link to Escrow.com (external, no in-app flow).
- `psa_vault` — PSA Vault transfer (external).
- `paypal_gs` — PayPal Goods & Services (external).
- `cash` — cash in person (external, no tracking).

**Unread badge:**
`GET /api/threads` returns `unreadCount` per thread. The sidebar nav shows a red dot
and the total count if there are any unread messages. Browser push notifications fire
(via the Web Notifications API) when new messages arrive while the user is on a
different page.

**Real-time updates:**
The inbox polls threads every 6 seconds by default, and reduces to 2 seconds while a
store meetup PIN is active. A global SSE connection (see §16) delivers instant payment
notifications.

---

## 13. Payment System

### What it does
Multiple payment methods for completing trades, all with a 3% platform fee. The seller
receives 97% of the agreed price credited to their in-app wallet.

### Implementation

#### DexPoky Wallet Payment (`/api/threads/:id/payment/wallet`)
1. Verify buyer has sufficient `walletBalanceCents` in `usersTable`.
2. Inside a `db.transaction`: deduct from buyer wallet, credit seller wallet (both
   atomic), insert `tradePaymentsTable` row, set offer `status = "paid"`.
3. Emit `payment_received` SSE event to seller (see §16).
4. Send seller notification email via Resend (see §16).
5. Set `listingsTable.status = "sold"` if the thread is linked to a listing.

#### Stripe Checkout Payment (`/api/threads/:id/payment/checkout`)
1. Create a Stripe Checkout session with `price_data` for the agreed amount + fee.
2. Return `{ url }` — client redirects buyer to Stripe-hosted checkout.
3. Stripe webhook (`POST /api/billing/webhook`) on `checkout.session.completed`:
   credits the seller wallet, updates offer/listing status, fires SSE + email.

#### Meet at Card Shop PIN Flow
1. Seller taps "Generate PIN" → server generates a 6-digit random PIN, stores
   `HMAC-SHA256(PIN, SESSION_SECRET)` + 10-minute expiry in `tradeOffersTable`.
   Returns the plaintext PIN only in that response.
2. Seller shows PIN to buyer standing next to them.
3. Buyer enters PIN → `PATCH /api/threads/:id/offer` with `action: "confirm_store_meetup"`.
4. Server validates hash + expiry, then executes wallet deduction (or returns Stripe
   URL if wallet insufficient) — same atomic transaction as wallet payment above.
5. PIN columns are cleared immediately after first use. Seller can regenerate at any time.

#### Fee calculation
`feeCents = Math.round(agreedPriceCents * 0.03)`. `netCents = agreedPriceCents - feeCents`.
The platform retains `feeCents`; `netCents` is credited to `usersTable.walletBalanceCents`
for the seller.

---

## 14. Seller Wallet & Earnings

### What it does
Each user has an in-app wallet (`walletBalanceCents` on `usersTable`). Sellers receive
trade proceeds here. Users can top up their balance via Stripe to use for buying cards.
Sellers can request payouts to their bank account.

### Implementation

**DB tables:**
- `usersTable.walletBalanceCents` — single source of truth for spendable balance.
- `tradePaymentsTable` — all credit events (trade proceeds) are recorded here.
- `sellerPayoutsTable` — `id`, `clerkId`, `amountCents`, `status` (enum: pending/
  processing/paid/cancelled), `createdAt`. Payout requests deduct from wallet atomically.

**API routes:**
- `GET /api/wallet/balance` — returns `{ balanceCents, pendingPayoutCents }`. Derives
  available balance from `walletBalanceCents` directly.
- `GET /api/wallet/earnings` — paginated transaction history merging `tradePaymentsTable`
  credits with `sellerPayoutsTable` debit records.
- `POST /api/wallet/topup` — creates a Stripe Checkout session for adding funds.
- `POST /api/wallet/payout` — creates a `sellerPayoutsTable` row and deducts the amount
  from `walletBalanceCents` atomically.

**Stripe top-up flow:**
`POST /api/wallet/topup` → Stripe Checkout session (one-time payment) → on webhook
`checkout.session.completed`, server increments `walletBalanceCents` and records a
`tradePaymentsTable` row with `method = "topup"`.

**Admin payout management (`/admin/payouts`):**
Admin-only page listing all pending payout requests. Admin can mark payouts as
processing or paid (external bank transfer handled manually). On cancellation, the
amount is re-credited to the seller's wallet.

**Real-time balance refresh:**
The global SSE stream fires a `wallet:refresh` event when the user's balance changes.
The wallet page and inbox page both listen and invalidate the React Query cache for
`/api/wallet/balance` on this event, so the balance updates instantly without a reload.

---

## 15. Ratings & Trust System

### What it does
eBay-style bidirectional ratings after completed trades. Buyers rate sellers and sellers
rate buyers. Each rating has an overall 1–5 star score, an optional text comment, four
optional sub-scores (Detailed Seller Ratings / DSRs), a 60-day submission window, and
a public seller trust level derived from total positive ratings.

### Implementation

**DB table:** `ratingsTable` — `id`, `raterClerkId`, `ratedClerkId`, `offerId` (FK),
`role` (enum: buyer_rating_seller / seller_rating_buyer), `score` (1–5), `comment`
(nullable), `subCondition` (nullable 1–5), `subCommunication` (nullable 1–5),
`subShipping` (nullable 1–5), `subValue` (nullable 1–5), `transactionCompletedAt`
(timestamp), `sellerReply` (nullable text), `sellerRepliedAt` (nullable timestamp),
`createdAt`.

**Submission window:** Ratings are only accepted if `now - transactionCompletedAt ≤ 60 days`.
After that, the form shows "Feedback period closed."

**API routes:**
- `POST /api/ratings` — submit a rating. Validates auth, 60-day window, uniqueness
  per offer+role. Accepts four optional sub-scores.
- `GET /api/ratings/user/:clerkId` — paginated ratings for a user. Includes per-dimension
  averages (`subConditionAvg`, etc.) alongside `ratingAverage` and `ratingCount`.
- `GET /api/ratings/user/:clerkId/summary` — aggregate stats for the seller trust badge.
- `POST /api/ratings/:id/reply` — seller replies to a rating (own ratings only, one
  reply per rating, max 500 chars).

**Seller trust levels (computed server-side):**
Based on total positive ratings received (score ≥ 4 counts as positive):

| Level | Positive rating count |
|---|---|
| New | 0 |
| Bronze | 1–9 |
| Silver | 10–49 |
| Gold | 50–199 |
| Platinum | 200–499 |
| Top Rated | 500+ |

**`SellerBadge` component:**
Shows the seller's trust level label (color-coded) + positive percentage. Rendered on:
- Every marketplace listing card.
- Seller profile header (`/seller/:clerkId`).
- Marketplace listing detail page.

**Public feedback page (`/feedback/:clerkId`):**
Anyone can view a seller's full feedback history. Page shows: avatar, username, overall
score, level badge, positive %, total count. Filter tabs: All / As Seller / As Buyer.
Time filters: Past month / 6 months / 12 months / All time. Each entry shows rater
avatar, username, stars, comment, sub-scores, date, and the seller's reply if one was
written.

**Rating prompt:**
After a `tradeOffers.status` becomes `"paid"` (any exchange method), both parties see
a rating card at the top of the inbox thread. The rating form shows four labeled
sub-score pickers (optional) plus the overall star input.

---

## 16. Notifications (SSE, Push, Email, SMS)

### What it does
Real-time and asynchronous notifications keep buyers and sellers informed of payments,
new messages, and wanted-listing matches without requiring page reloads.

### Implementation

#### Server-Sent Events (SSE)
**Route:** `GET /api/sse` (auth required). Each authenticated session holds a long-lived
SSE connection identified by `clerkId`.

**Events emitted by server:**
- `payment_received` — payload: `{ offerId, amountCents, feeCents, netCents, method }`.
  Triggers toast notification in the inbox and wallet balance refresh.
- `wallet:refresh` — triggers wallet balance re-fetch on wallet page and inbox.

**Client (`use-payment-sse` hook):**
Globally mounted in `App.tsx` (`<PaymentSSEGlobal />`). On `payment_received`, shows
a Sonner toast and invalidates the wallet balance query. On `wallet:refresh`,
invalidates the wallet balance query.

#### Browser Push Notifications
The `UserWidget` component requests `Notification` permission when unread messages
arrive. If granted, fires a native browser notification with a link to `/inbox`.
Triggered by polling `GET /api/threads` every 30 seconds.

#### Email (Resend)
All transactional emails are sent via the Resend integration (`resend` connector,
configured in Replit integrations). The `RESEND_API_KEY` is fetched fresh from the
Replit connector on every send (never cached).

**Email triggers:**
- Seller receives payment confirmation email when buyer pays (wallet, Stripe, or store
  meetup methods). Template shows amount, card name, buyer username.
- Wanted-listing match: buyer receives email when a listed card matches their request.
  Template includes card image, listing price, and link to the listing.
- Invite outreach emails (see §20).

**Internal email proxy (`POST /api/email/send`):**
Agents with a DexPoky API key can send transactional emails through the platform's
Resend account without needing their own Resend credentials. Protected by `requireApiKey`.
Rate limit: 50 emails per API key per 24 hours. Delivery history in `emailSendsTable`.

#### SMS (Twilio)
Used by DexAgents (see §18) for approval request notifications. Configured via
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` secrets.
SMS is not used for standard user notifications.

---

## 17. Sharing & OG Cards

### What it does
Every card, listing, category, collection, and "Looking For" request has a public
shareable URL that renders a rich preview (correct `og:image`, `og:title`, description)
for iMessage, Twitter, and other social previews. The preview card uses the actual card
image with a rarity-derived colored border, baked into the OG thumbnail image.

### Implementation

**Short links:**
`shortenTable` — `id`, `code` (8-char random), `targetUrl`. `GET /s/:code` redirects
to the full URL. The `POST /api/shorten` endpoint creates short links.

**OG redirect pages (server-side HTML):**
Four routes render static HTML pages with correct Open Graph meta tags:
- `GET /og/card/:id` — card detail OG page.
- `GET /og/listing/:id` — listing OG page.
- `GET /og/w/:shortCode` — wanted listing OG page.
- `GET /og/s/:shortCode` — short-link OG page.

Each page renders a minimal HTML shell with `<meta property="og:*">` tags, the card
image with a colored CSS border, an inline 3D tilt script, and a redirect after a
brief delay.

**OG image endpoint (`GET /api/og/img`):**
Accepts `url` (card image URL), `color` (hex), and `size` query params. Uses `sharp`
to fetch the source image and composite a solid-color border frame around it (5% inset
on each side). Returns PNG with cache headers. This baked-in border appears in iMessage
previews before the user taps the link.

**Rarity-to-color mapping:**
`secret_rare` → gold (`#f5d020`), `ultra_rare` → orange-gold, `holo_rare` → purple,
`rare` → blue, `uncommon` → green, `common` → silver. Category color overrides rarity
color when set.

**3D tilt on redirect pages:**
An inline `<script>` listens for `pointermove`, `touchmove`, and `deviceorientation`
events and applies CSS `rotateX`/`rotateY` 3D transforms (max ±15°) to the card image
element. Degrades gracefully if JS is blocked.

**Group shares (`/view/group/:code`):**
`groupSharesTable` stores a JSONB array of card IDs. `GET /view/group/:code` renders a
public view of a curated set of cards from the user's collection.

**OG tests:**
The four OG redirect routes and the `/api/og/img` endpoint have automated tests in
`artifacts/api-server/src/routes/og.test.ts` run by Vitest.

---

## 18. DexAgents (Automated Trading Agents)

### What it does
Users can create autonomous agents that monitor the marketplace and automatically buy or
sell cards on their behalf based on configurable rules. Buyer agents watch for listings
matching a target Pokémon within a budget. Seller agents list a card when no current
listing meets the seller's floor price. Agents can require human approval before acting.

### Implementation

**DB tables:**
- `dexAgentsTable` — `id`, `clerkId`, `name`, `agentRole` (enum: buyer/seller),
  `status` (enum: active/paused/stopped), `pokemonName`, `targetSetName`,
  `triggerType` (enum: buy_now/bid), `maxPricePathUsd`, `budgetPathUsd`,
  `requireHoloOnly`, `requireCondition`, `requireApproval`, `floorPricePathUsd`,
  `cardId` (for seller agents), `totalSpentCents`, `totalEarnedCents`, `runCount`,
  `lastRunAt`, `createdAt`.
- `agentRunsTable` — `id`, `agentId`, `status`, `result` (JSONB), `createdAt`.
- `agentApprovalRequestsTable` — `id`, `agentId`, `clerkId`, `listingId`,
  `suggestedPriceCents`, `status` (enum: pending/approved/rejected/expired),
  `createdAt`, `expiresAt` (24h TTL).
- `agentExternalFindsTable` — `id`, `agentId`, `clerkId`, `platform` (enum: ebay/tcgplayer),
  `listingUrl`, `title`, `priceCents`, `status` (enum: new/dismissed), `createdAt`.

**API routes (all auth-required, owner-scoped):**
- `GET /api/agents` — list user's agents.
- `POST /api/agents` — create agent (buyer or seller schema).
- `PATCH /api/agents/:id` — update agent (pause, activate, change config).
- `DELETE /api/agents/:id` — delete agent.
- `GET /api/agents/:id/runs` — run history for an agent.
- `POST /api/agents/:id/run` — manually trigger an agent run.
- `GET /api/agents/approvals` — pending approval requests for the user.
- `PATCH /api/agents/approvals/:id` — approve or reject a pending purchase.
- `GET /api/agents/external-finds` — external marketplace finds (eBay).
- `PATCH /api/agents/external-finds/:id` — dismiss a find.

**Buyer agent logic (`POST /api/agents/:id/run`):**
1. Search `listingsTable` for active Buy Now listings matching the agent's
   `pokemonName`, within `maxPricePathUsd`, optionally filtered by holo/condition.
2. If `requireApproval = true`: create `agentApprovalRequestsTable` row and send SMS
   to the user's phone via Twilio. Agent pauses until approved/rejected/expired.
3. If approved (or `requireApproval = false`): execute wallet payment atomically
   (same flow as §13 DexPoky Wallet Payment). Set `agentAcquiredAt` on the acquired
   card. Send purchase notification email to the user.
4. Also checks eBay active listings via `fetchEbayActiveListings()` (eBay Browse API,
   requires `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`) and stores finds in
   `agentExternalFindsTable` so the user can review them.

**Seller agent logic:**
1. Check if the target card already has an active listing within the floor price range.
2. If not: create a `listingsTable` row for the card at the floor price.

**Approval notification via Twilio SMS:**
When a buyer agent identifies a purchase opportunity requiring approval, it sends an
SMS to the user's phone number (from Clerk profile): "Your DexPoky agent found a
[card name] for $[price]. Approve at [link]." The user has 24 hours to respond via
the in-app approvals panel.

**Frontend (`/agents`):**
- Dashboard showing all agents with status, run count, total spent/earned.
- "Create Agent" dialog (buyer or seller role selection, form fields).
- Per-agent run history table.
- Approval requests panel (cards to approve/reject with deadline countdown).
- External finds panel (eBay results the user can visit or dismiss).
- `InAppWalletPanel` — shows wallet balance and top-up button, embedded in the agents
  page to give buyers quick access to their budget.

---

## 19. Developer SDK & API Keys

### What it does
Third-party developers and agent scripts can access DexPoky's marketplace and outreach
features via a REST API protected by API keys. A developer dashboard provides key
management and full SDK documentation.

### Implementation

**DB table:** `apiKeysTable` — `id`, `clerkId`, `name`, `keyHash` (SHA-256 of the
actual key), `keyPrefix` (first 8 chars for display), `lastUsedAt`, `createdAt`,
`revokedAt` (nullable).

**Key format:** `dpx_<32-char random hex>`. The full key is shown only at creation
time. Only the SHA-256 hash is stored.

**`requireApiKey` middleware:**
Reads `Authorization: Bearer <key>` header, hashes it, looks up in `apiKeysTable`.
Returns `{ apiKeyId, clerkId }` on success. Rejects revoked keys.

**API routes (API key auth):**
- `POST /api/developer/keys` — generate a new API key (returns full key once).
- `GET /api/developer/keys` — list the authenticated user's keys (prefix only, no secret).
- `DELETE /api/developer/keys/:id` — revoke a key.
- `POST /api/outreach/invite` — send a Pokémon-card-format invite email (see §20).
- `GET /api/outreach/invites` — invite send history.
- `POST /api/email/send` — send a transactional email via platform Resend account.
- `GET /api/email/sends` — email send history for the calling key.
- `GET /api/admin/backup/db` — stream a fresh `pg_dump` (protected by `BACKUP_SECRET`,
  not API key — separate auth for security).

**Client SDK (`lib/api-sdk`):**
TypeScript SDK package published as `@workspace/api-sdk`. Namespaces:
- `client.outreach.invite(params)` — send an invite email.
- `client.outreach.listInvites()` — list invite history.
- `client.links.listing(id)` — get public + short URL for a listing.
- `client.links.card(id)`, `.collection(clerkId?)`, `.wanted(shortCode)`,
  `.groupShare(code)` — URL helpers.
- `client.email.send(params)` — send a transactional email.
- `client.email.listSends()` — email send history.

**Developer page (`/developer`):**
Full SDK documentation page with:
- API key management panel (generate, list, revoke).
- Getting started guide with npm install + initialization snippet.
- Section for each SDK namespace with endpoint specs and copy-ready code examples.
- "Outreach & Invitations" section.
- "Email Proxy" section.
- Rate limit documentation.

---

## 20. SDK Outreach & Invite Tracking

### What it does
Agent scripts can send Pokémon-card-themed HTML invite emails to people not yet on the
platform. Each invite is tracked, and when a recipient signs up via the invite link,
the conversion is attributed back to the sending agent.

### Implementation

**DB tables:**
- `inviteSendsTable` — `id`, `apiKeyId`, `fromClerkId`, `toEmail`, `toName`,
  `subject`, `status` (sent/failed), `featuredListingId` (nullable), `ctaUrl`,
  `refCode` (unique `dpx_<id>` attribution code), `convertedClerkId` (nullable,
  set when the recipient signs up), `convertedAt` (nullable), `sentAt`.

**Email template:**
Styled as a Pokémon card on a dark navy background (`#1a1a2e`). Structure:
- **Card header** — DexPoky logo + set symbol icon.
- **Art box** — featured listing's card image if `featuredListingId` is provided,
  else the DexPoky platform hero graphic.
- **Name bar** — personalized: "Ash's Invite" (recipient's first name + "'s Invite").
- **Stats block** — 3 live platform stats fetched at send time (active listing count,
  average card value, collector count).
- **Flavor text** — the agent's composed message (max 400 chars).
- **CTA button** — "Join DexPoky free →" pointing to `ctaUrl` decorated with
  `?ref=dpx_<id>`.
- **Footer** — legal unsubscribe line.

**CTA URL decoration:**
The invite endpoint appends `?ref=dpx_<inviteSend.id>` to the `ctaUrl`. When a
recipient lands on DexPoky with this param, `InviteRefSync` (in `App.tsx`) captures
it into `sessionStorage`. When the user completes sign-up, the ref is POSTed to
`POST /api/outreach/convert`, which sets `inviteSendsTable.convertedClerkId` and
`convertedAt`.

**Rate limit:** 30 invites per API key per 24 hours. Returns HTTP 429 on excess.

**API routes:**
- `POST /api/outreach/invite` — send invite. Requires API key auth.
- `GET /api/outreach/invites` — list last 100 invites for the key.
- `POST /api/outreach/convert` — record sign-up conversion. Requires user auth (not
  API key), called automatically by `InviteRefSync`.

---

## 21. Subscription & Billing

### What it does
A Stripe-backed subscription system gates how many card scans a user can do per month.
Free tier users get a limited scan allowance; paid subscribers get unlimited scans.

### Implementation

**Stripe integration:**
Uses the Replit-managed Stripe integration. In production (`REPLIT_DEPLOYMENT=1`), the
live Stripe account is used. In development, the test account is used. The integration
connector provides the Stripe secret key at runtime via `listConnections('stripe')`.

**DB fields on `usersTable`:** `stripeCustomerId` (nullable text).

**DB table:** `scanUsageTable` — `id`, `clerkId`, `month` (YYYY-MM string), `count`.

**Stripe products:**
Defined via the Stripe dashboard. `GET /api/billing/plans` returns available plans with
prices. `stripeStorage.getProductsWithPrices()` reads from Stripe's API.

**API routes:**
- `GET /api/billing/status` — returns `{ tier, scansUsed, scansAllowed, subscriptionStatus }`.
- `GET /api/billing/plans` — list plans (public).
- `POST /api/billing/checkout` — create Stripe Checkout session for subscription.
- `POST /api/billing/portal` — create Stripe Customer Portal session for managing
  the subscription.
- `POST /api/billing/webhook` — Stripe webhook handler for `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`.

**Frontend (`/subscription`):**
Subscription status page showing current plan, scan usage bar, upgrade/manage buttons.
Redirects to Stripe Checkout (for upgrade) or Stripe Customer Portal (for existing
subscribers to manage billing).

---

## 22. Admin Panel

### What it does
A minimal admin-only section for managing seller payout requests and maintaining
platform operations. Accessible to Clerk IDs listed in `ADMIN_CLERK_IDS` env var or
emails in `ADMIN_EMAILS`.

### Implementation

**Admin check:**
`isAdmin(clerkId)` function in `admin.ts` checks against `ADMIN_CLERK_IDS` (comma-
separated Clerk IDs) and `ADMIN_EMAILS` (comma-separated emails) env vars.

**`requireAdmin` middleware:** Wraps `requireAuth` + `isAdmin` check. Returns 403 if
not an admin.

**API routes (all require admin):**
- `GET /api/admin/payouts` — list all pending/processing payout requests across all
  sellers, with seller username and wallet balance.
- `PATCH /api/admin/payouts/:id` — update payout status to `processing`, `paid`, or
  `cancelled`. On `cancelled`, re-credits the seller's wallet atomically.
- `GET /api/admin/users` — list all users (for troubleshooting).
- `POST /api/admin/sync-users` — trigger a Clerk user sync for all users.

**Frontend (`/admin/payouts`):**
Table of pending payout requests with seller name, amount, requested date, and action
buttons (Mark Processing, Mark Paid, Cancel). Route is protected with `ProtectedRoute`
but also requires the admin role (enforced server-side on every API call).

---

## 23. Username System & Anonymous Trainer

### What it does
All public-facing user references use the user's chosen username, never their Clerk
first/last name. Users who haven't set a username yet appear as "Anonymous Trainer"
on all public pages.

### Implementation

**Username requirement:**
- `usersTable.username` — unique, nullable, validated regex `/^[a-zA-Z0-9_]{3,30}$/`.
- `wantedListingsTable.ownerDisplayName` — DB-level CHECK constraint: `column NOT LIKE '% %'`
  (no spaces), enforced at insert time. API-level Zod guard rejects names with spaces.
- `listingsTable.ownerDisplayName` — same CHECK constraint.
- Same constraint applied to all other tables that store display names.

**"Anonymous Trainer" fallback:**
Any page that displays a username checks `user.username ?? null`. If null, renders
the string "Anonymous Trainer" with a styled `<em>` tag using muted foreground color.
Applied consistently on: seller profile, card detail view, listing detail view,
collection view, category view.

**Username gate (`UsernameGate` component):**
After sign-up, wraps all protected routes. If `profile.username` is null, shows a
modal prompting the user to pick a username. The modal cannot be dismissed — all routes
wait until a username is set. Linked from the profile page.

**Post-sign-up prompt:**
`WelcomeBackModal` component (shown on first sign-in after the gate clears) encourages
profile completion.

---

## 24. Public Profiles & Seller Pages

### What it does
Each seller has a public profile page showing their active listings, trust badge,
feedback summary, and seller description. Public card, collection, category, and
listing views are available without authentication.

### Implementation

**Seller profile (`/seller/:clerkId`):**
- Header: avatar, username (or "Anonymous Trainer"), `SellerBadge` (trust level + %),
  seller description, "See all feedback" link.
- Active listings grid (filtered to this seller).
- Links to the seller's feedback page.

**Feedback page (`/feedback/:clerkId`):**
- Public, no auth required.
- Header stats, filter tabs (All / As Seller / As Buyer, time range).
- Each feedback entry: rater avatar, username, stars, sub-scores, comment, date,
  transaction type, and the seller's reply (if any).
- Seller can write a one-time reply to each rating from this page (auth required,
  must be the rated party).

**Public card view (`/view/card/:id`):**
Dark gradient hero showing card photo with 3D HoloCard tilt effect, card metadata,
owner username (or "Anonymous Trainer"), and an "I'm interested" CTA.

**Public listing view (`/view/listing/:id`):**
Dark gradient hero showing listing photo, price, condition badge, seller trust badge,
and action buttons (Buy Now / Contact Seller). Available without login.

**Public collection view (`/view/collection`):**
Shows the authenticated user's collection to the public (shareable URL). Query param
`?owner=<clerkId>` renders another user's collection.

**Public category view (`/view/category/:id`):**
All cards in a specific category, public.

**Group share view (`/view/group/:code`):**
A curated selection of cards (a "group share") with a custom description. Generated
from the `/share` page.

---

## 25. Backup & GitHub Sync

### What it does
All code changes are automatically mirrored to GitHub. Full database + object storage
backups are created after every task merge and uploaded as GitHub Release assets.
A streaming database download endpoint allows on-demand DB exports via curl.

### Implementation

**GitHub sync:**
`scripts/post-merge.sh` pushes to `https://github.com/joelauge/dexpoky.git` on the
`main` branch using `GITHUB_TOKEN` (classic PAT with `repo` scope) after every
background task merge. Main-agent session changes are pushed manually at end of session
using the same inline-URL `git push` command (avoids writing to `.git/config`).

**Full backup (`scripts/src/backup.ts`, run via `pnpm --filter @workspace/scripts run backup`):**
1. `pg_dump -Fc $DATABASE_URL | gzip -9` → `db-<timestamp>.dump.gz`.
2. Lists all objects in the Replit GCS bucket via `@google-cloud/storage`, skipping
   directory markers (keys ending in `/`), downloads all real files to a temp dir.
3. `tar -czf storage-<timestamp>.tar.gz` bundles all storage files.
4. GitHub Releases API: creates a release tagged `backup-<timestamp>`, uploads both
   files as release assets (up to 2 GB per asset).
5. Cleans up temp dir.

Backup is also triggered automatically at the end of `scripts/post-merge.sh` (non-blocking,
failure is logged but does not fail the merge).

**Database download endpoint (`GET /api/admin/backup/db`):**
Streams a fresh `pg_dump -Fc` through `gzip -9` directly in the HTTP response.
Auth: `Authorization: Bearer <BACKUP_SECRET>` header or `?token=<BACKUP_SECRET>` query
param. `BACKUP_SECRET` is a dedicated env secret — separate from API keys.
Response headers: `Content-Type: application/octet-stream`, `Content-Disposition: attachment`.
Restore: `gunzip db.dump.gz && pg_restore -d <target_db> -j 4 db.dump`.

**`RESTORE.md`:**
Step-by-step guide for restoring the full application on a new host: DB restore,
object storage migration (GCS / S3 / R2), all required env vars, Express server
startup, nginx configuration.

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Random 32+ char secret for session/PIN hashing |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (Vite/frontend) |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (server) |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (server) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Yes | Replit GCS bucket ID |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Yes | GCS search paths for public objects |
| `PRIVATE_OBJECT_DIR` | Yes | GCS directory for private uploads |
| `OPENAI_API_KEY` | Yes | OpenAI API key (card scanning, deck builder) |
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID (agent approval SMS) |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes | Twilio sender number |
| `GITHUB_TOKEN` | Yes | GitHub PAT, repo scope (backup + sync) |
| `BACKUP_SECRET` | Yes | Bearer token for `/api/admin/backup/db` |
| `ADMIN_CLERK_IDS` | Recommended | Comma-separated Clerk IDs with admin access |
| `ADMIN_EMAILS` | Recommended | Comma-separated emails with admin access |
| `EBAY_CLIENT_ID` | Optional | eBay Browse API client ID (DexAgent external finds) |
| `EBAY_CLIENT_SECRET` | Optional | eBay Browse API secret |
| `REPLIT_DEPLOYMENT` | Auto | Set to `1` in production; switches Stripe to live mode |

Resend and Stripe credentials are **not** stored as env vars — they are fetched at
runtime from Replit integration connectors (`listConnections('resend')` /
`listConnections('stripe')`).

---

## Database Schema Summary

| Table | Purpose |
|---|---|
| `usersTable` | User accounts, wallet balance, Stripe customer ID |
| `cardsTable` | Card collection entries with metadata and image paths |
| `categoriesTable` | User-defined collection folders |
| `listingsTable` | Marketplace listings (buy now + auctions) |
| `auctionBidsTable` | Auction bid history with proxy bid amounts |
| `wishlistTable` | Cards users want to acquire |
| `wantedListingsTable` | "Looking For" public wanted requests |
| `decksTable` | AI-suggested deck configurations |
| `dmThreadsTable` | P2P trade conversation threads |
| `dmMessagesTable` | Messages within threads |
| `tradeOffersTable` | Offer state within threads (price, method, PIN) |
| `tradePaymentsTable` | Completed payment records |
| `ratingsTable` | Buyer/seller ratings with sub-scores |
| `sellerPayoutsTable` | Payout requests from sellers |
| `dexAgentsTable` | Automated buyer/seller agent configs |
| `agentRunsTable` | Agent execution history |
| `agentApprovalRequestsTable` | Pending purchase approvals for agents |
| `agentExternalFindsTable` | eBay/external listings found by agents |
| `apiKeysTable` | Developer API keys (hashed) |
| `inviteSendsTable` | SDK outreach invite delivery + conversion tracking |
| `emailSendsTable` | Email proxy delivery history per API key |
| `scanUsageTable` | Monthly scan count per user (for billing gates) |
| `cardPriceHistoryTable` | Estimated value history per card |
| `shortLinksTable` | Short URL code → target URL mappings |
| `groupSharesTable` | Curated card group share configurations |
| `cardGradingCertsTable` | Professional grading certificate records |
| `activityEventsTable` | In-app activity feed (wanted listing matches, etc.) |
