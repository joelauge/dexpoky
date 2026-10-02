---
name: Component review expectations
description: The user's requirement for strict visual criticism of DexPoky components.
---

"Spin up a harsh critic for any component you build so that we can make sure it's visually perfect."

**Why:** The user explicitly requested independent visual criticism during the binder work.

**How to apply:** Have changed DexPoky components critically reviewed, fix substantive findings, and distinguish code-based review from actual rendered visual inspection. Do not claim visual perfection when WebGL cannot be inspected.

Testing screenshot IDs may be viewable by the main agent but unavailable to a separate critic.

**Why:** A critic received “image not found” for the same tester screenshot IDs that the main agent could successfully view.

**How to apply:** Share accessible image files when available. Otherwise inspect the screenshots directly and report the critic's source-only limitation; passing source review is not rendered visual proof.

Preserved image URLs or flat-view DOM nodes do not prove that the 3D page turn has no redraw.

**Why:** The user still observed a forward-turn left-page redraw after flat-view image reuse had passed. Animation-face and landing handoffs can visibly change without any image reload.

**How to apply:** Check forward and reverse animation faces and their landing transforms separately. When WebGL rendering is unavailable, report that limitation rather than treating fallback-view checks as 3D visual verification.