---
name: TypeSafe integration
description: How DexPoky should combine Jev judgments with authoritative facts and human-controlled decisions.
---

Use TypeSafe Jev through its documented server-side HTTP API. Keep exact catalog printing identity and exact-printing pricing as deterministic gates; Jev may score evidence uncertainty but must not override a mismatch, fallback price, or missing exact price. DexPoky owns the user-facing judgment, explanation, and voice. Rank actions from strongest to weakest, hide low-confidence actions, and pair every visible action with a direct next step.

**Why:** The HTTP API was verified against the configured service, while SDK installation was not reliable. Catalog and pricing facts are exact constraints rather than probabilistic judgments. Users should not see provider details or spend space on weak suggestions, and young users need clear actions they can take immediately.

**How to apply:** For future Jev features, keep the API key server-side, validate responses, provide an explicit unavailable fallback, and place code-owned hard gates around model scores. Use simple DexPoky language and do not show a required action without an adjacent working control.

For trade reviews, calculate each party's cash and card totals in code and keep them visibly separate from semantic judgments. Cache only successful judgments for a bounded time, version the evaluator, and never let Jev accept, reject, reprice, transfer ownership, or claim a trade is guaranteed fair.

For semantic reranking, build and filter the complete eligible candidate set in code before calling Jev. With no semantic intent, preserve exact deterministic behavior. If semantic evaluation is unavailable or malformed, show low-confidence fallback results and suppress urgent notifications rather than treating fallback confidence as high.

For marketplace listing reviews, keep ownership, catalog identity, positive prices, auction timing/price relationships, saved-condition contradictions, and verified grading claims as code-owned publication gates. Jev may score completeness, clarity, consistency, and supporting evidence, but low confidence or provider failure must remain advisory when those gates pass. Persist only a versioned normalized review snapshot, evidence hash, and timestamp; never raw provider output. Never treat the review as authentication, automatic claim rewriting, repricing, delisting, or account enforcement.

For trust and dispute workflows, expose only privacy-safe aggregate transaction and rating facts on public profiles. Keep report descriptions and evidence private. Jev may summarize reliability dimensions and classify issue category, urgency, or missing evidence, but code must verify transaction participation and force serious or low-confidence cases to human review. Jev must never determine fault, issue refunds, suspend accounts, change ratings, or trigger financial actions.

**Why:** Trust summaries can become defamatory when they invent intent, while dispute judgments can directly affect money and account access. Sparse history, malicious reports, and provider failure all require conservative handling.

**How to apply:** Use neutral observed-fact language, label sparse evidence as uncertain, persist normalized versioned triage only, and keep enforcement and financial state changes in explicit human-controlled workflows.