---
name: Persisted identity keys
description: Why catalog identity tuples need a PostgreSQL-safe encoding and a real storage check.
---

Persist identity tuples with a NUL-free, unambiguous encoding such as JSON rather than copying a binary-delimited in-memory merge key.

**Why:** PostgreSQL text rejects NUL characters. Mocked supplement-storage tests passed while a genuinely missing card could not be inserted.

**How to apply:** Keep in-memory and persisted identity encodings distinct where needed, and verify storage compatibility against PostgreSQL rather than relying only on mocked insert tests.