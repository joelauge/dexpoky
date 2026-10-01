---
name: TypeSafe integration
description: How DexPoky should combine Jev judgments with authoritative facts and human-controlled decisions.
---

Use TypeSafe Jev through its documented server-side HTTP API. Keep exact catalog printing identity and exact-printing pricing as deterministic gates; Jev may score evidence uncertainty but must not override a mismatch, fallback price, or missing exact price. DexPoky owns the user-facing judgment, explanation, and voice. Rank actions from strongest to weakest, hide low-confidence actions, and pair every visible action with a direct next step.

**Why:** The HTTP API was verified against the configured service, while SDK installation was not reliable. Catalog and pricing facts are exact constraints rather than probabilistic judgments. Users should not see provider details or spend space on weak suggestions, and young users need clear actions they can take immediately.

**How to apply:** For future Jev features, keep the API key server-side, validate responses, provide an explicit unavailable fallback, and place code-owned hard gates around model scores. Use simple DexPoky language and do not show a required action without an adjacent working control.

For trade reviews, calculate each party's cash and card totals in code and keep them visibly separate from semantic judgments. Cache only successful judgments for a bounded time, version the evaluator, and never let Jev accept, reject, reprice, transfer ownership, or claim a trade is guaranteed fair.

For semantic reranking, build and filter the complete eligible candidate set in code before calling Jev. With no semantic intent, preserve exact deterministic behavior. If semantic evaluation is unavailable or malformed, show low-confidence fallback results and suppress urgent notifications rather than treating fallback confidence as high.

For scan matching, use Jev to help choose the suggested printing before review, not only to score an already-selected card. Jev currently accepts text only; image evidence must first become an observation-only vision description alongside OCR. An OCR/catalog match is not proof the OCR was correct, and a model's concentrated distribution is not a measured real-world accuracy rate.

**Why:** The user requested most-likely selection from both image and OCR evidence. Live TypeSafe documentation confirmed the text-only modality. Incorrect catalog choices can otherwise look authoritative and carry another printing's price.

**How to apply:** Keep observed details distinct from inferred catalog identity, let contradictory evidence remain a review case, and preserve manual alternatives. Treat suggestion thresholds as initial safety settings until calibrated with labeled physical-card scans; never claim measured scan accuracy from mocked UI tests.

Keep “best available result” separate from “correct printing.” Ranking cannot resolve missing catalog coverage, and a user's manual choice must not inherit the original recommendation's identity claim.

**Why:** The user wants best-first scanner results, but the anniversary MEE printings exposed a catalog-coverage gap. A plausible alternative can rank first without being the scanned card; retaining an exact-match explanation after a manual change misrepresents that choice.

**How to apply:** Rank the available alternatives while retaining explicit uncertainty, attach recommendation labels and explanations only to the recommended identity, and check catalog coverage separately when the correct printing is absent.

For marketplace listing reviews, keep ownership, catalog identity, positive prices, auction timing/price relationships, saved-condition contradictions, and verified grading claims as code-owned publication gates. Jev may score completeness, clarity, consistency, and supporting evidence, but low confidence or provider failure must remain advisory when those gates pass. Persist only a versioned normalized review snapshot, evidence hash, and timestamp; never raw provider output. Never treat the review as authentication, automatic claim rewriting, repricing, delisting, or account enforcement.

For trust and dispute workflows, expose only privacy-safe aggregate transaction and rating facts on public profiles. Keep report descriptions and evidence private. Jev may summarize reliability dimensions and classify issue category, urgency, or missing evidence, but code must verify transaction participation and force serious or low-confidence cases to human review. Jev must never determine fault, issue refunds, suspend accounts, change ratings, or trigger financial actions.

**Why:** Trust summaries can become defamatory when they invent intent, while dispute judgments can directly affect money and account access. Sparse history, malicious reports, and provider failure all require conservative handling.

**How to apply:** Use neutral observed-fact language, label sparse evidence as uncertain, persist normalized versioned triage only, and keep enforcement and financial state changes in explicit human-controlled workflows.