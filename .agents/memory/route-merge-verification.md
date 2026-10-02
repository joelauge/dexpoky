---
name: Route merge verification
description: An environment-specific risk when syncing files with many similar handlers.
---

After an automated sync merges route files with repeated handler patterns, verify the merged request schemas, database operations, and pricing variables against the main-project version, including handlers outside the visible conflict.

**Why:** A scanner-artwork sync exposed one conflict but also silently transported parsing and database blocks into unrelated collection handlers. Resolving the visible markers alone did not preserve working routes.

**How to apply:** Use the base-to-merged diff and inexpensive endpoint regression tests to confirm each changed handler still performs its own operation. Do not treat a clean merge or a pre-sync passing test as verification of the post-sync state.