---
name: TypeSafe integration
description: How DexPoky should combine Jev judgments with authoritative card facts.
---

Use TypeSafe Jev through its documented server-side HTTP API. Keep exact catalog printing identity and exact-printing pricing as deterministic gates; Jev may score evidence uncertainty but must not override a mismatch, fallback price, or missing exact price.

**Why:** The HTTP API was verified against the configured service, while SDK installation was not reliable. Catalog and pricing facts are exact constraints rather than probabilistic judgments.

**How to apply:** For future Jev features, keep the API key server-side, validate responses, provide an explicit unavailable fallback, and place code-owned hard gates around model scores.