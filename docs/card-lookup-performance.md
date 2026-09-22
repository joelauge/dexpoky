# Card lookup performance

Baseline measured on September 22, 2026 against the development API (12 sequential requests):

| Lookup | p50 | p95 |
| --- | ---: | ---: |
| Catalog search | 430 ms | 620 ms |
| Scan exact-printing lookup | 815 ms | 4,540 ms |
| Owned route/auth overhead only | 21 ms | 27 ms |

The authenticated owned-library dataset could not be benchmarked without a user session, so the server now records rolling p50/p95 for the full owner-scoped query in production logs.

## Targets

- Owned-library searches: p50 under 30 ms and p95 under 75 ms.
- Cached catalog identity and scan-printing results: p50 under 25 ms and p95 under 75 ms.
- Uncached catalog identity results: p95 under 750 ms, returning identity before optional image enrichment.
- Jev reranking: only descriptive free text, hard-budgeted to 180 ms, with deterministic order returned on timeout or failure.

## Freshness

- Catalog identity responses are cached for 10 minutes.
- Exact scan identity responses are cached for 15 minutes.
- Image backfills retain their existing 24-hour source cache and update the identity cache asynchronously.
- Pricing freshness policy is unchanged; each response states that prices reflect its upstream catalog response.
- Owned-library result sets are never cached server-side, preventing cross-owner leakage.