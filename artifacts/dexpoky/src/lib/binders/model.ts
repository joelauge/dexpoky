import type { Binder, BinderPage, Card } from "@workspace/api-client-react";

export const MAX_PAGES = 60;
export const GRID_PRESETS: Array<{ count: number; rows: number; columns: number }> = [
  { count: 4, rows: 2, columns: 2 },
  { count: 9, rows: 3, columns: 3 },
  { count: 12, rows: 3, columns: 4 },
  { count: 16, rows: 4, columns: 4 },
];
export const DEFAULTS = { rows: 3, columns: 3, widthMm: 250, heightMm: 310, pageCount: 4 };

/** Minimal safe card shape for rendering. Negative ids are wishlist placeholders. */
export type DisplayCard = Pick<Card, "id" | "name" | "imageUrl">;
export const isWishlistId = (id: number) => id < 0;
export const wishlistDisplay = (w: { id: number; name: string; imageUrl?: string | null }): DisplayCard => ({
  id: -w.id, name: w.name, imageUrl: w.imageUrl ?? null,
});

export type Pages = BinderPage[];
export type SlotRef = { pageId: string; slot: number };
export type Selection = ({ type: "library"; cardId: number }) | ({ type: "slot" } & SlotRef) | null;

export const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));

/** Each owned Card record is exactly one copy. */
export function qtyOf(_card: Card): number {
  return 1;
}

export function usageOf(pages: Pages): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of pages) for (const s of p.slots) m.set(s.cardId, (m.get(s.cardId) ?? 0) + 1);
  return m;
}

export function serialize(b: Pick<Binder, "name" | "style" | "coverColor" | "pages" | "isPublic">): string {
  return JSON.stringify({
    n: b.name,
    u: !!b.isPublic,
    s: b.style,
    c: b.coverColor.toLowerCase(),
    p: b.pages.map((p) => ({ ...p, slots: [...p.slots].sort((a, c) => a.slot - c.slot) })),
  });
}

const sortSlots = (p: BinderPage): BinderPage => ({ ...p, slots: [...p.slots].sort((a, b) => a.slot - b.slot) });

export function cardAt(pages: Pages, ref: SlotRef): number | undefined {
  return pages.find((p) => p.id === ref.pageId)?.slots.find((s) => s.slot === ref.slot)?.cardId;
}

function withSlot(pages: Pages, ref: SlotRef, cardId: number | undefined): Pages {
  return pages.map((p) => {
    if (p.id !== ref.pageId) return p;
    const rest = p.slots.filter((s) => s.slot !== ref.slot);
    if (cardId !== undefined) rest.push({ slot: ref.slot, cardId });
    return sortSlots({ ...p, slots: rest });
  });
}

export type OpResult = { pages: Pages; replacedCardId?: number } | { error: string };

export function placeFromLibrary(pages: Pages, cards: Map<number, Card>, ref: SlotRef, cardId: number): OpResult {
  const card = cards.get(cardId);
  if (cardId <= 0) return { error: "Only owned cards can be placed from the tray." };
  if (!card) return { error: "That card is not in your collection." };
  const page = pages.find((p) => p.id === ref.pageId);
  if (!page || ref.slot < 0 || ref.slot >= page.rows * page.columns) return { error: "That pocket does not exist." };
  const prev = cardAt(pages, ref);
  const cleared = withSlot(pages, ref, undefined);
  if ((usageOf(cleared).get(cardId) ?? 0) >= qtyOf(card))
    return { error: `${card.name} is already placed in this binder. Clear that pocket or move it instead.` };
  return { pages: withSlot(cleared, ref, cardId), replacedCardId: prev };
}

/** Atomic move; if target is occupied the two cards swap. */
export function moveSlot(pages: Pages, from: SlotRef, to: SlotRef): OpResult {
  if (from.pageId === to.pageId && from.slot === to.slot) return { pages };
  const toPage = pages.find((p) => p.id === to.pageId);
  if (!toPage || to.slot < 0 || to.slot >= toPage.rows * toPage.columns) return { error: "That pocket does not exist." };
  const a = cardAt(pages, from);
  if (a === undefined) return { error: "Nothing to move from that pocket." };
  const b = cardAt(pages, to);
  let next = withSlot(pages, to, a);
  next = withSlot(next, from, b);
  return { pages: next };
}

/** Reserve an empty pocket for a wishlist item (stored as the negative item id). */
export function placeWishlist(pages: Pages, ref: SlotRef, wishlistItemId: number): OpResult {
  if (!Number.isInteger(wishlistItemId) || wishlistItemId <= 0) return { error: "That wishlist card is not valid." };
  const page = pages.find((p) => p.id === ref.pageId);
  if (!page || ref.slot < 0 || ref.slot >= page.rows * page.columns) return { error: "That pocket does not exist." };
  if (cardAt(pages, ref) !== undefined) return { error: "That pocket is already taken." };
  if ((usageOf(pages).get(-wishlistItemId) ?? 0) > 0) return { error: "That wishlist card already has a pocket in this binder." };
  return { pages: withSlot(pages, ref, -wishlistItemId) };
}

export const clearSlot = (pages: Pages, ref: SlotRef): Pages => withSlot(pages, ref, undefined);

export function resizePreview(page: BinderPage, rows: number, columns: number): number[] {
  const cap = rows * columns;
  return page.slots.filter((s) => s.slot >= cap).map((s) => s.cardId);
}

export function resizePage(
  pages: Pages,
  pageId: string,
  dims: { rows: number; columns: number; widthMm: number; heightMm: number },
): Pages {
  const cap = dims.rows * dims.columns;
  return pages.map((p) => (p.id === pageId ? sortSlots({ ...p, ...dims, slots: p.slots.filter((s) => s.slot < cap) }) : p));
}

export function newPage(like?: BinderPage): BinderPage {
  return {
    id: crypto.randomUUID(),
    rows: like?.rows ?? DEFAULTS.rows,
    columns: like?.columns ?? DEFAULTS.columns,
    widthMm: like?.widthMm ?? DEFAULTS.widthMm,
    heightMm: like?.heightMm ?? DEFAULTS.heightMm,
    slots: [],
  };
}

export const maxSpread = (pageCount: number) => Math.max(0, Math.floor((pageCount - 1) / 2) * 2);
export const isConflict = (e: unknown) => (e as { status?: number })?.status === 409;
