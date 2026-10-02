export type BinderPageLayout = {
  id: string | number;
  rows: number;
  columns: number;
  widthMm: number;
  heightMm: number;
};

export function adjacentSpreadPageIndexes(
  pageCount: number,
  spreadStart: number,
  pagesPerSpread = 2,
  adjacentSpreads = 1,
) {
  const count = Math.max(0, Math.floor(pageCount));
  const perSpread = Math.max(1, Math.floor(pagesPerSpread));
  const adjacent = Math.max(0, Math.floor(adjacentSpreads));
  if (!count) return [];
  const current = Math.min(count - 1, Math.max(0, Math.floor(spreadStart)));
  const first = Math.max(0, current - adjacent * perSpread);
  const end = Math.min(count, current + (adjacent + 1) * perSpread);
  return Array.from({ length: end - first }, (_, offset) => first + offset);
}

export function activeSpreadPageIndexes(pageCount: number, spreadStart: number, pagesPerSpread = 2) {
  return adjacentSpreadPageIndexes(pageCount, spreadStart, pagesPerSpread, 0);
}

export function stablePageCompositionKey(page: Pick<BinderPageLayout, "id">, binderId?: string | number) {
  return `binder-page:${String(binderId ?? "")}:${String(page.id)}`;
}

export function pageGeometrySignature(page: BinderPageLayout) {
  return JSON.stringify([page.id, page.rows, page.columns, page.widthMm, page.heightMm]);
}

/** LRU order is oldest first. Hidden pages outside the bounded window are always evicted. */
export function updatePageCompositionLru(
  previous: readonly string[],
  windowKeys: readonly string[],
  activeKeys: readonly string[],
  capacity = 6,
  composeWindow = false,
) {
  const boundedCapacity = Math.max(0, Math.floor(capacity));
  const allowed = new Set(windowKeys);
  const active = new Set(activeKeys.filter((key) => allowed.has(key)));
  const next = previous.filter((key) => allowed.has(key) && !active.has(key));
  const touch = (key: string) => {
    if (!allowed.has(key)) return;
    const existing = next.indexOf(key);
    if (existing >= 0) next.splice(existing, 1);
    next.push(key);
  };
  if (composeWindow) for (const key of windowKeys) touch(key);
  for (const key of activeKeys) touch(key);
  while (next.length > boundedCapacity) {
    const evictIndex = next.findIndex((key) => !active.has(key));
    next.splice(evictIndex >= 0 ? evictIndex : 0, 1);
  }
  return next;
}