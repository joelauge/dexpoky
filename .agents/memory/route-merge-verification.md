---
name: Route merge verification
description: An environment-specific risk when syncing files with many similar handlers.
---

After an automated sync merges route files with repeated handler patterns, verify the merged request schemas, database operations, and pricing variables against known-good handler contracts, including handlers outside the visible conflict. The current main-project version can itself contain the same corruption; do not assume it is a working restore source.

**Why:** Automated syncs can transport parsing and database blocks into unrelated handlers even when visible conflicts are resolved. A clean merge or a commit labeled as a restoration does not establish correctness.

**How to apply:** Use the base-to-merged diff and inexpensive endpoint regression tests to confirm each changed handler still performs its own operation. Include validation failures, owner scoping, and assertions that read-only confidence scoring cannot insert cards. Do not treat a clean merge or a pre-sync passing test as verification of the post-sync state. Repeat this check when the merge retries against a newer main branch: a retry can reintroduce the same misplaced blocks even after an earlier resolution passed.
