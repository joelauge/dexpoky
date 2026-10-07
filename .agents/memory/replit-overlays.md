---
name: Replit overlays
description: Distinguish app development helpers from Replit-managed publishing widgets.
---

Do not claim all Replit overlays are removed based only on removing the Vite dev-banner plugin or inspecting the development preview.

**Why:** The user still reported a bottom-right Replit helper overlapping Scan after the app's development banner had been removed and the preview checked.

**How to apply:** Identify whether the affected page is the published app or the development preview. Check current Replit documentation for the Publishing feedback-widget setting; it is separate from app source. If the widget's identity is unclear, obtain a screenshot rather than assuming it is the development banner.
