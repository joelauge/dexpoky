import { logger } from "./logger.js";

export type LookupKind = "owned" | "catalog" | "scan";
export type CacheStatus = "hit" | "miss" | "deduped";

type CacheEntry<T> = { value: T; expiresAt: number };

export class BoundedAsyncCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs = this.ttlMs): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest) this.entries.delete(oldest);
      else break;
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<{ value: T; status: CacheStatus }> {
    const cached = this.get(key);
    if (cached !== undefined) return { value: cached, status: "hit" };
    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, status: "deduped" };
    const promise = loader();
    this.inflight.set(key, promise);
    try {
      const value = await promise;
      this.set(key, value);
      return { value, status: "miss" };
    } finally {
      this.inflight.delete(key);
    }
  }
}

const samples: Record<LookupKind, number[]> = { owned: [], catalog: [], scan: [] };
const counters = { cacheHit: 0, cacheMiss: 0, cacheDeduped: 0, jevInvoked: 0, jevFallback: 0 };

function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.round((sorted.length - 1) * quantile))]!;
}

export function recordLookup(
  kind: LookupKind,
  durationMs: number,
  fields: { cache?: CacheStatus; externalMs?: number; jev?: "invoked" | "fallback" | "skipped" } = {},
): void {
  const bucket = samples[kind];
  bucket.push(durationMs);
  if (bucket.length > 200) bucket.splice(0, bucket.length - 200);
  if (fields.cache === "hit") counters.cacheHit++;
  if (fields.cache === "miss") counters.cacheMiss++;
  if (fields.cache === "deduped") counters.cacheDeduped++;
  if (fields.jev === "invoked") counters.jevInvoked++;
  if (fields.jev === "fallback") { counters.jevInvoked++; counters.jevFallback++; }
  logger.info({
    lookup: kind,
    durationMs: Math.round(durationMs),
    externalMs: fields.externalMs == null ? undefined : Math.round(fields.externalMs),
    cache: fields.cache,
    jev: fields.jev,
    p50Ms: Math.round(percentile(bucket, 0.5)),
    p95Ms: Math.round(percentile(bucket, 0.95)),
    cacheHitRate: counters.cacheHit + counters.cacheMiss + counters.cacheDeduped === 0 ? 0 :
      counters.cacheHit / (counters.cacheHit + counters.cacheMiss + counters.cacheDeduped),
    jevInvocationRate: counters.jevInvoked / Math.max(1, bucket.length),
  }, "card lookup performance");
}

export function normalizeLookupKey(...parts: Array<string | number | undefined>): string {
  return parts.map((part) => String(part ?? "").trim().toLowerCase()).join("::");
}
