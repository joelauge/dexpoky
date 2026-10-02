---
name: Set catalog loading
description: Why set-index enrichment must remain bounded and details load catalog cards lazily.
---

Do not load every matched TCGCSV product catalog when serving the Sets index. Keep cold index enrichment limited to explicitly verified expansions that need it, and load other product catalogs when their set detail is requested.

**Why:** Matching the catalogs exposed more than a hundred eligible groups. Loading each group's products for index counts could take several minutes after a server restart, even with limited concurrency; the product cache is process-local.

**How to apply:** Use TCGdex's full checklist total as the index baseline, preserve verified catalog aliases, and reuse bounded, expiring exact counts learned from merged set details. Any expansion of cold index enrichment needs an explicit latency and upstream-request budget.

On the Sets/Expansions page, the user wants "the ones we last had activity in, in a row at the top of the page."

**Why:** This is a shortcut back to the collector's recently used expansions, not a request to prioritize recent catalog releases or upstream catalog changes.

**How to apply:** Keep personal activity ordering separate from the full expansion grid's release/name/completion sorting, and preserve the bounded index-loading rule above.