---
name: Set catalog loading
description: Why set-index enrichment must remain bounded and details load catalog cards lazily.
---

Do not load every matched TCGCSV product catalog when serving the Sets index. Keep cold index enrichment limited to explicitly verified expansions that need it, and load other product catalogs when their set detail is requested.

**Why:** Matching the catalogs exposed more than a hundred eligible groups. Loading each group's products for index counts could take several minutes after a server restart, even with limited concurrency; the product cache is process-local.

**How to apply:** Use TCGdex's full checklist total as the index baseline, preserve verified catalog aliases, and reuse bounded, expiring exact counts learned from merged set details. Any expansion of cold index enrichment needs an explicit latency and upstream-request budget.