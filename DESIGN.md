# DexPoky Design Language

A living reference for how DexPoky looks, feels, and behaves. When adding new UI, start here.

---

## 1. Design Philosophy

DexPoky lives at the intersection of a **collector's app** and a **trading marketplace**. The aesthetic is clean, modern, and data-forward — but grounded in the warmth and tactility of physical card collecting. Pokémon TCG cards have a specific feel: foil, rarity, condition, the 3:4 portrait ratio. The UI reflects all of this without being cartoonish.

The core principles:
- **Flat and material, not skeuomorphic** — surfaces are clean white/navy cards with subtle borders. No heavy drop shadows. Depth is communicated through elevation overlays, not blur stacks.
- **Cards are the hero** — the 3:4 aspect ratio appears everywhere cards are displayed. Grid layouts are built around it. Never crop cards to squares.
- **Collector vocabulary** — rarity, condition, and set name are first-class information. They have consistent color systems, not ad-hoc labels.
- **Progressive disclosure** — dashboards show summaries; drilling in reveals full detail. Filters and search reduce to the relevant.
- **Agentic layer on top** — DexAgents and the developer SDK exist as a more technical layer. Violet/indigo signals "automation/AI" features throughout the app.

---

## 2. Color System

Colors are defined as CSS custom properties in `artifacts/dexpoky/src/index.css` using HSL values. Tailwind consumes them via `@theme inline`. Light and dark modes both use the same token names.

### Core Palette

| Token | Light | Dark | Notes |
|---|---|---|---|
| `background` | `210 20% 98%` (off-white) | `222 47% 11%` (deep navy) | Page background |
| `foreground` | `222 47% 11%` (near-black) | `210 40% 98%` (near-white) | Body text |
| `card` | `0 0% 100%` (white) | `222 47% 11%` (navy) | Surface color |
| `border` | `214 32% 91%` (cool gray) | `217 32% 17%` (dark blue-gray) | Dividers, outlines |
| `primary` | `221 83% 53%` (blue) | same | Interactive elements, nav active |
| `secondary` | `210 40% 96%` | `217 32% 17%` | Muted surfaces, hover states |
| `muted-foreground` | `215.4 16.3% 46.9%` | `215 20.2% 65.1%` | Metadata, labels, captions |
| `destructive` | `0 84.2% 60.2%` (red) | `0 62.8% 30.6%` (dark red) | Delete, error |
| `ring` | `221 83% 53%` (blue) | same | Focus ring |

### Accent Colors (Semantic)

Beyond the token system, these hue families are used consistently:

| Context | Color | Usage |
|---|---|---|
| Agent/AI/automation | Violet/indigo (`violet-*`, `indigo-*`) | DexAgents panel, AI deck builder, wallet InAppPanel |
| Success / good condition | Emerald (`emerald-*`) | Mint/Near Mint condition, "sent" confirmations |
| Warning / played | Amber (`amber-*`) | Light Played / Played condition, caution callouts |
| Danger | Red (`red-500`) | Poor condition, destructive actions, unread badge |
| Info | Blue (`blue-*`) | Rare cards, Excellent condition, info callouts |
| Premium | Gold/yellow gradient (`#f5d020` → `#c87800`) | Invite emails, Pokémon-card-themed surfaces |

### Rarity Colors

Defined in `lib/constants.ts` as `RARITY_COLORS`, applied via `Badge`:

| Rarity | Badge Colors |
|---|---|
| Common | Gray |
| Uncommon | Green |
| Rare | Blue |
| Holo Rare | Purple |
| Ultra Rare | Orange |
| Secret Rare | Yellow |
| Promo | Pink |

### Condition Colors

Defined as `CONDITION_COLORS`:

| Condition | Badge Colors |
|---|---|
| Mint / Near Mint | Emerald |
| Excellent / Good | Blue |
| Light Played / Played | Amber |
| Poor | Red |

---

## 3. Typography

**Font family:** [Google Sans Flex](https://fonts.google.com/specimen/Google+Sans+Flex) — a variable font with optical size, slant, width, weight, and roundness axes. It is antialiased (`font-sans antialiased`) on the body.

- Variable, humanist sans — reads well at all sizes from 9px badges to 3xl headings
- Monospace fallback for card numbers, codes: `Menlo, monospace` (`font-mono`)

### Type Scale in Practice

| Use | Class | Notes |
|---|---|---|
| Page title | `text-2xl font-bold` | Section headers on feature pages |
| Section heading | `text-lg font-semibold` | Card titles, panel headers |
| Body | `text-sm` (default) | Most content, form labels |
| Metadata / caption | `text-xs text-muted-foreground` | Card numbers, dates, sub-labels |
| Tiny badge label | `text-[10px] uppercase tracking-wider font-bold` | Rarity/condition badges, status chips |
| Mono snippet | `text-xs font-mono` | Card numbers, wallet addresses, code |

**Letter spacing:** `tracking-wider` is used on uppercase micro-labels only. Body text is `tracking-normal`.

---

## 4. Spacing & Sizing

Tailwind's default `0.25rem` (4px) spacing scale is used throughout.

Common spacing patterns:
- Page content: `p-4` to `p-6` on containers
- Card internal padding: `p-3` for compact cards, `p-5` for panels
- Gap between grid items: `gap-3` to `gap-4`
- Section gaps: `space-y-4` to `space-y-6`

---

## 5. Border Radius

Base radius is `--radius: 0.5rem` (8px). Tailwind radius tokens:

| Token | Value | Used on |
|---|---|---|
| `rounded-md` | 6px | Buttons, small chips |
| `rounded-lg` | 8px | Default card radius |
| `rounded-xl` | 12px | Card surfaces (`Card` component), card items, panels |
| `rounded-2xl` | 16px | Wallet/agent panels, mobile menu overlay |
| `rounded-full` | Full | Avatar images, notification dots, pill badges |

Card item grid cells use `rounded-xl` with `rounded-t-xl` on the image area. Full-page view headers use `rounded-2xl` or larger. Buttons use `rounded-md`.

---

## 6. Elevation & Shadows

DexPoky uses an **overlay-based elevation system** rather than drop shadows. Shadows are defined in CSS but use `opacity: 0.00` — effectively invisible. Depth is communicated via:

### Hover / Active Elevate

CSS utility classes in `index.css`:

- `.hover-elevate` — on hover, applies `var(--elevate-1)` (`rgba(0,0,0,0.03)` light / `rgba(255,255,255,0.04)` dark) as a `::after` overlay
- `.hover-elevate-2` — applies `var(--elevate-2)` (slightly stronger: `0.08` / `0.09`)
- `.active-elevate` / `.active-elevate-2` — same on `:active` state

Buttons use both: `hover-elevate active-elevate-2`. Badges use `hover-elevate`.

This means interactive surfaces get a barely-visible tint on hover that feels native without visual clutter.

### Card Item Animation

`CardItem` uses Framer Motion for lift on hover:
```
whileHover={{ y: -5, scale: 1.02 }}
transition={{ type: "spring", stiffness: 300, damping: 20 }}
```
Paired with `hover:shadow-md` transition on the card container for a combined depth effect.

### HoloCard 3D Tilt

The `HoloCard` component (used on card detail views) applies full 3D perspective tilt on mouse move:
- Max rotation: ±14° on both axes
- Glare: radial gradient overlay tracking cursor position at 28% opacity (`mix-blend-mode: overlay`)
- Rainbow shimmer: rotating linear gradient at 0.1 opacity (`mix-blend-mode: color-dodge`)
- Scroll tilt: gentle ±7° ambient rotation based on scroll position (mobile)
- Spring return: `0.55s cubic-bezier(0.23, 1, 0.32, 1)` ease-out

---

## 7. Components

Built on **shadcn/ui** primitives with Tailwind v4. Component source is in `artifacts/dexpoky/src/components/ui/`.

### Button

Five variants, all use `hover-elevate active-elevate-2`:

| Variant | Appearance |
|---|---|
| `default` | Blue primary, primary border |
| `destructive` | Red, destructive border |
| `outline` | Transparent bg, `var(--button-outline)` border (10% black/white) |
| `secondary` | Secondary bg, secondary border |
| `ghost` | Transparent bg, transparent border |
| `link` | Blue underline |

Sizes: `sm` (32px min-h), `default` (36px min-h), `lg` (40px min-h), `icon` (36×36px).

### Badge

Four variants, all `whitespace-nowrap` (never wrap):

| Variant | Use |
|---|---|
| `default` | Primary blue — active status, agent badges |
| `secondary` | Muted — "For Sale" on card art, general metadata |
| `destructive` | Red — error states |
| `outline` | Bordered — rarity/condition (uses `RARITY_COLORS`/`CONDITION_COLORS`) |

Rarity and condition badges always use `outline` variant with specific Tailwind color overrides, applied at the use site.

### Card (Surface)

`rounded-xl border bg-card text-card-foreground shadow`. Most content panels use this. Sub-components: `CardHeader`, `CardContent`, `CardFooter`, `CardTitle`, `CardDescription`.

### CardItem (Collection Grid Cell)

`aspect-[3/4]` image area with `rounded-t-xl overflow-hidden`, then a `p-3` metadata section below. Framer Motion hover lift. Badge overlays on image (rarity bottom-left, "For Sale" top-right, "New" top-left for agent acquisitions). Name, set, condition, and price in the metadata strip.

---

## 8. Layout

### Desktop — Collapsible Sidebar

- **Expanded:** 256px wide, logo at top, nav items with icon + label, quick-action section, user widget at bottom
- **Collapsed:** 64px wide, icon-only, PokeBall SVG as the collapse toggle button, tooltips on hover
- **Sticky:** `h-screen sticky top-0`, sidebar scrolls independently via `ScrollArea`
- **Transition:** `transition-all duration-300` on width

Nav items: `rounded-md`, active state is `bg-primary text-primary-foreground font-medium shadow-sm`, inactive is `text-muted-foreground hover:bg-secondary`.

### Mobile — Bottom Profile Bar

- Fixed to bottom of screen, `z-40`
- Tap user avatar/name to expand a sliding panel (`rounded-t-2xl shadow-2xl`) with all account links
- Mobile header: sticky top, hamburger → Sheet slide-in from left with full nav

### Page Width

Pages wrap in `min-h-screen bg-background flex flex-col md:flex-row`. Content area is `flex-1 overflow-auto`. No fixed max-width is enforced globally; individual pages use `max-w-*` as needed (typically `max-w-6xl` or `max-w-5xl mx-auto` for content pages).

---

## 9. Dark / Public Pages

Several public-facing views (listing detail, card detail, collection view, seller profile) use a **dark gradient hero header** rather than the standard light card background:

```
bg-gradient-to-b from-slate-900 via-slate-800 to-background
```
or
```
bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900
```

These pages use `text-white` on the hero section with `text-white/50` or `text-white/70` for muted secondary text, transitioning to the standard `bg-background` token in the content below.

This treatment is reserved for **anonymous/public shareable pages** — the "show card to anyone" URLs. Authenticated app pages use the light/dark token system.

---

## 10. Feature-Specific Color Identity

Certain features have their own color identity built on top of the core system:

### Wallet / Payments
Violet-to-indigo gradient panels: `from-violet-50 to-indigo-50` (light) or `from-violet-600 to-indigo-600` (dark accents). `text-violet-700` for labels, `border-violet-100` for panel borders.

### DexAgents (Automation)
Same violet/indigo palette as wallet — automation and agentic features share this identity. Bot icon (`Bot` from Lucide), purple accent for agent status indicators.

### Marketplace / Trading
Neutral — uses standard primary blue for actions, standard card surfaces. No special hue override.

### Auctions
`Gavel` icon from Lucide. Countdown timers use red (`text-red-*`) when approaching end time. Bids shown in emerald green.

### Scan / AI Features
`ScanLine` / `Sparkles` icons. No strong color override — sits in the standard palette. The AI deck builder uses standard page chrome.

### Email Templates (Outreach)
Gold gradient (`#f5d020` → `#c87800`) on a deep navy background (`#1a1a2e`). This is a deliberate departure — it looks like a physical Pokémon card, intended for out-of-app email.

---

## 11. Icons

**Lucide React** is the sole icon library. Icons are sized consistently:
- Navigation items: `h-5 w-5`
- Button icons (default button): `h-4 w-4` (controlled by `[&_svg]:size-4` in button base)
- Small metadata icons: `h-3.5 w-3.5` or `h-3 w-3`
- Hero/feature icons: `h-8 w-8` or larger, sometimes wrapped in a colored `rounded-xl` container

**PokeBall** is a custom inline SVG (red top, white bottom, center circle, black stripe) used exclusively for the sidebar collapse toggle.

---

## 12. Motion & Animation

| Surface | Animation |
|---|---|
| Card grid items | Framer Motion spring: `y: -5, scale: 1.02` on hover, spring stiffness 300 |
| HoloCard 3D | Mouse-driven `rotateX`/`rotateY`, `0.07s linear` tracking, `0.55s cubic-bezier(0.23,1,0.32,1)` spring return |
| Sidebar collapse | `transition-all duration-300` on width |
| Mobile profile panel | `transition-all duration-200 ease-out` on max-height |
| Button/badge hover | CSS `::after` overlay fade, no duration override (instant feel) |
| Toasts | Sonner defaults |
| Skeleton loading | Tailwind `animate-pulse` via shadcn Skeleton |

Keep animations **purposeful and short**. No decorative entrance animations on page load. Motion is reserved for direct user interaction feedback.

---

## 13. Imagery & Artwork

- **Card images:** Always displayed at `aspect-[3/4]` (portrait). `object-cover object-center`. Never cropped to square.
- **Placeholder:** When no image, the DexPoky logo at 20% opacity, grayscale, centered. Not a broken image icon.
- **Avatars:** Clerk-provided profile images, `rounded-full`, bordered with `border-border`.
- **Logo:** `/dexpoky-logo.png` displayed at `w-48` in sidebar header, `h-10` in mobile header.
- **Open Graph / email hero:** `/opengraph.jpg` used in outreach email art slot as fallback.

---

## 14. Forms & Inputs

- `Input`: `rounded-md border border-input bg-background` — standard Tailwind/shadcn
- `Textarea`: same family
- `Select`: shadcn Select with `rounded-md`
- `Switch`: shadcn Switch for boolean toggles (used in agent approval settings)
- `Label`: `text-sm font-medium`
- Field layout: label above input, `space-y-1.5` or `space-y-2` between label and control
- Error messages: `text-xs text-destructive` below the field
- `InputGroup` (custom): icon + input side by side, unified border

---

## 15. Empty States

The `Empty` component (`components/ui/empty.tsx`) is used when a list has no items:
- Centered, muted text
- Optional icon
- Optional action button
- Used consistently across collection, wishlist, marketplace, trades

Pattern: icon → heading → description → optional CTA. Never just raw text.

---

## 16. Writing Tone in UI

- **Terse and direct.** "Add Card" not "Click here to add a new card to your collection."
- **Friendly, not casual.** "No cards yet" not "Wow, your collection is empty!"
- **Collector vocabulary.** Use "listing," "condition," "rarity," "set," "pull," "trade" — not generic e-commerce terms.
- **Anonymous users:** "Anonymous Trainer" — never "Unknown User" or "Anonymous Seller."
- **Agent persona:** Agents act on your behalf. "Your agent bought X" not "X was purchased."
- **Error messages:** Specific about what failed, not "Something went wrong." If Resend isn't connected: "Email delivery requires the Resend integration to be connected."
