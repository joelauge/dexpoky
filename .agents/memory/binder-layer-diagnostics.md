---
name: Binder layer diagnostics
description: Distinguishing GPU depth conflicts from card-paper intersections in the hybrid binder renderer.
---

Distinguish GPU z-fighting from CSS3D card-paper intersections when diagnosing flip artifacts. The CSS3D and WebGL renderers do not share a depth buffer.

**Why:** The user reported shearing around cards during page flips. Flat card surfaces can intersect curved CSS paper even when their centers have different Z coordinates; GPU polygon offsets alone cannot correct that.

**How to apply:** Inspect card edges in actual animation frames, not just mesh depths or image-resource counts. Check normal separation and the complete rigid card footprint, and keep CSS3D-only verification distinct from a full WebGL viewer pass.

Do not assume CSS `backface-visibility: hidden` alone prevents opposite-face paper from bleeding across card artwork.

**Why:** A native CSS3D turn frame in a GL-disabled test browser showed cream strips across reverse-side artwork. Explicitly hiding the camera-away CSS faces removed the strips in the same frozen frame.

**How to apply:** Verify actual pixels and camera-facing normals separately. Preserve connected artwork hosts when controlling face visibility; native CSS3D evidence does not establish a full WebGL viewer pass.

Keep Three's outer CSS3D hosts absolutely positioned; put relatively positioned content inside them.

**Why:** A diagnostic accidentally overrode the outer host with `position: relative`, creating extreme offscreen bounds despite valid world positions. That initially produced a false application failure.

**How to apply:** Match real portal host styles in diagnostic harnesses and check host styles/world projection before attributing strange bounding rectangles to app geometry.
