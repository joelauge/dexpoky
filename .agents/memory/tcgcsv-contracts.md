---
name: TCGCSV response contracts
description: Live-verified differences between TCGCSV static catalogs and prices, and the limits of its pricing data.
---

Treat TCGCSV as daily static datasets, not a uniform paginated TCGplayer API. Its nonempty static price files can omit the total count, while product and group catalogs generally supply it; explicitly empty product groups can also omit it.

**Why:** Live verification on 2026-10-01 found legitimate MEE prices rejected by a shared catalog-envelope validator. A missing price must not be confused with an incompatible response format, and relaxing every endpoint would instead allow incomplete identity catalogs.

**How to apply:** Verify each endpoint's actual contract against https://tcgcsv.com/ before changing shared validation. Keep completeness checks specific to the dataset rather than requiring the same envelope everywhere.

TCGCSV prices are USD product/finish prices, not condition-specific SKU prices or graded-card valuations.

**Why:** The source explicitly does not distribute SKUs, and multiple finishes can share one product ID. The daily snapshot is not a live transaction-price guarantee.

**How to apply:** Keep exact product identity and finish distinct, do not synthesize condition or PSA estimates from this source, and avoid calling these values live condition-specific prices.