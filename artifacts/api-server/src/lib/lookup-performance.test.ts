import { describe, expect, it, vi } from "vitest";
import { BoundedAsyncCache } from "./lookup-performance.js";

describe("BoundedAsyncCache", () => {
  it("deduplicates concurrent loads and reuses fresh results", async () => {
    const cache = new BoundedAsyncCache<number>(2, 60_000);
    const loader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return 42;
    });
    const [first, second] = await Promise.all([
      cache.getOrLoad("same", loader),
      cache.getOrLoad("same", loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect([first.status, second.status].sort()).toEqual(["deduped", "miss"]);
    expect((await cache.getOrLoad("same", loader)).status).toBe("hit");
  });

  it("expires stale values and evicts the oldest entry at its bound", async () => {
    vi.useFakeTimers();
    const cache = new BoundedAsyncCache<number>(2, 100);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    vi.advanceTimersByTime(101);
    expect(cache.get("b")).toBeUndefined();
    vi.useRealTimers();
  });
});
