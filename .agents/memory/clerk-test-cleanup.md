---
name: Clerk test identity cleanup
description: Clean up temporary browser-test identities when frontend deletion requires re-verification.
---

Frontend deletion of a temporary Clerk test identity can fail with `403 session_reverification_required` even after programmatic sign-in succeeded.

**Why:** Browser test cleanup encountered this restriction; the existing server Clerk SDK's administrative deletion succeeded.

**How to apply:** Check Clerk management status, then delete only the exact identities created for the test through the existing server SDK. Keep credentials internal, verify those identities return 404, and also remove their temporary local app data. Never delete pre-existing identities or change authentication configuration to bypass the restriction.
