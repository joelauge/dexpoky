---
name: GA4 page-view authority
description: The user's confirmed GA4 property settings and prohibition on duplicate SPA page views.
---

The user confirmed: "GA4 enhanced measurement already sends page_view on history changes," and instructed: "do NOT add a manual page_view on route change."

**Why:** Avoid double counting SPA navigation. The property's enhanced-measurement setting is outside the app code.

**How to apply:** Leave history-change page views to GA4. Do not add manual route-change page-view events or router analytics hooks while this property setting remains enabled.
