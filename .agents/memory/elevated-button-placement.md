---
name: Elevated button placement
description: Avoid conflicting positioned layouts with the shared button's elevation styles.
---

Keep positioned layout on a wrapper around shared Buttons rather than relying on an `absolute` class on the Button itself.

**Why:** The shared elevation selectors force `position: relative` with higher specificity than a plain positioning utility. This made a Set card's Wishlist button flow below its full-height image and get clipped into an apparently unclickable strip.

**How to apply:** For overlays, position a surrounding container and let its Button occupy that container normally. Alternatively, place the action in normal flow. Do not change global elevation CSS just to fix one control, since other components depend on it.