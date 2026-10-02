const counts = new Map<string, { count: number; expiresAt: number }>();
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 256;

export function cachedMergedSetCount(setId: string): number | null {
  const cached = counts.get(setId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    counts.delete(setId);
    return null;
  }
  counts.delete(setId);
  counts.set(setId, cached);
  return cached.count;
}

export function rememberMergedSetCount(setId: string, count: number): void {
  counts.delete(setId);
  counts.set(setId, { count, expiresAt: Date.now() + TTL_MS });
  while (counts.size > MAX_ENTRIES) {
    const oldest = counts.keys().next().value;
    if (oldest === undefined) break;
    counts.delete(oldest);
  }
}